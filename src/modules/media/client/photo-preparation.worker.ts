import type createLibheif from "libheif-js/libheif-wasm/libheif-bundle.mjs";
import {
  assertPhotoDimensions,
  encodeListingPhoto,
  type EncodedPhoto,
  type PhotoFormat,
} from "./photo-preparation-core";

export interface PreparationRequest {
  readonly file: File;
  readonly format: PhotoFormat;
  readonly software: boolean;
}
export type PreparationResponse =
  | { readonly result: EncodedPhoto }
  | { readonly error: string; readonly stage: "decode" | "prepare" };

class NativeDecodeError extends Error {}

let decoderModule: ReturnType<typeof createLibheif> | undefined;

async function prepare(request: PreparationRequest): Promise<EncodedPhoto> {
  if (!request.software) {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(request.file, {
        imageOrientation: "from-image",
      });
    } catch {
      throw new NativeDecodeError();
    }
    try {
      return await encodeListingPhoto(
        bitmap,
        bitmap.width,
        bitmap.height,
        request.format,
      );
    } finally {
      bitmap.close();
    }
  }
  decoderModule ??= import("libheif-js/libheif-wasm/libheif-bundle.mjs").then(
    (module) => module.default(),
  );
  const libheif = await decoderModule;
  const decoder = new libheif.HeifDecoder();
  const images = decoder.decode(
    new Uint8Array(await request.file.arrayBuffer()),
  );
  let surface: OffscreenCanvas | undefined;
  try {
    const primary = images.find((image) => image.is_primary()) ?? images[0];
    if (!primary)
      throw new Error(
        "HEIC decoding failed. Export this photo as JPEG and retry.",
      );
    const width = primary.get_width();
    const height = primary.get_height();
    assertPhotoDimensions(width, height);
    const pixels = new ImageData(width, height);
    await new Promise<void>((resolve, reject) =>
      primary.display(pixels, (result) =>
        result ? resolve() : reject(new Error("HEIC decoding failed.")),
      ),
    );
    surface = new OffscreenCanvas(width, height);
    const context = surface.getContext("2d", { colorSpace: "srgb" });
    if (!context) throw new Error("Photo preparation is unavailable.");
    context.putImageData(pixels, 0, 0);
    return await encodeListingPhoto(surface, width, height, request.format);
  } finally {
    if (surface) {
      surface.width = 0;
      surface.height = 0;
    }
    for (const image of images) image.free();
    if (decoder.decoder) libheif.heif_context_free(decoder.decoder);
    decoder.decoder = null;
  }
}

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<PreparationRequest>) => void;
  postMessage(value: PreparationResponse): void;
};
scope.onmessage = (event) => {
  void prepare(event.data).then(
    (result) => scope.postMessage({ result }),
    (error: unknown) =>
      scope.postMessage({
        error: "This photo could not be prepared. Retry or export it as JPEG.",
        stage: error instanceof NativeDecodeError ? "decode" : "prepare",
      }),
  );
};
