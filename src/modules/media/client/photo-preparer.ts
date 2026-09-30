import {
  encodeListingPhoto,
  inspectPhoto,
  type EncodedPhoto,
  type PhotoFormat,
} from "./photo-preparation-core";
import type { PreparationResponse } from "./photo-preparation.worker";

export interface PreparedListingPhoto extends EncodedPhoto {
  readonly file: File;
  readonly originalBytes: number;
  readonly preparationMs: number;
  readonly decoder: "native" | "software";
}

class PreparationTerminalError extends Error {}

async function nativeElement(
  file: File,
  format: PhotoFormat,
  signal: AbortSignal,
): Promise<EncodedPhoto> {
  const source = new Image();
  const url = URL.createObjectURL(file);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      abort = () =>
        reject(new DOMException("Photo preparation canceled.", "AbortError"));
      signal.addEventListener("abort", abort, { once: true });
      timer = setTimeout(
        () => reject(new Error("Photo decoding timed out.")),
        15_000,
      );
      source.onload = () => resolve();
      source.onerror = () => reject(new Error("Native decoding failed."));
      source.src = url;
    });
    signal.throwIfAborted();
    try {
      return await encodeListingPhoto(
        source,
        source.naturalWidth,
        source.naturalHeight,
        format,
      );
    } catch (error) {
      throw new PreparationTerminalError(
        error instanceof Error ? error.message : "Photo encoding failed.",
      );
    }
  } finally {
    clearTimeout(timer);
    if (abort) signal.removeEventListener("abort", abort);
    source.onload = null;
    source.onerror = null;
    source.src = "";
    URL.revokeObjectURL(url);
  }
}

/** One instance per batch, called by the single preparation lane. */
export function createPhotoPreparer() {
  let worker: Worker | undefined;
  function dispose() {
    worker?.terminate();
    worker = undefined;
  }
  async function inWorker(
    file: File,
    format: PhotoFormat,
    software: boolean,
    signal: AbortSignal,
  ): Promise<EncodedPhoto> {
    signal.throwIfAborted();
    worker ??= new Worker(
      new URL("./photo-preparation.worker.ts", import.meta.url),
      { type: "module" },
    );
    const active = worker;
    return new Promise((resolve, reject) => {
      const finish = (
        result?: EncodedPhoto,
        error?: Error,
        resetWorker = true,
      ) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        active.onmessage = null;
        active.onerror = null;
        active.onmessageerror = null;
        if (error) {
          if (resetWorker) dispose();
          reject(error);
        } else if (result) resolve(result);
      };
      const abort = () =>
        finish(
          undefined,
          new DOMException("Photo preparation canceled.", "AbortError"),
        );
      const timer = setTimeout(
        () =>
          finish(
            undefined,
            new Error(
              "Photo preparation timed out. Export this photo as JPEG and retry.",
            ),
          ),
        30_000,
      );
      signal.addEventListener("abort", abort, { once: true });
      active.onmessage = (event: MessageEvent<PreparationResponse>) => {
        if ("result" in event.data) finish(event.data.result);
        else
          finish(
            undefined,
            event.data.stage === "prepare"
              ? new PreparationTerminalError(event.data.error)
              : new Error(event.data.error),
            software,
          );
      };
      active.onerror = active.onmessageerror = () =>
        finish(undefined, new Error("Photo preparation failed."));
      try {
        active.postMessage({ file, format, software });
      } catch {
        finish(
          undefined,
          new Error("Photo worker could not receive this file."),
        );
      }
    });
  }
  return {
    dispose,
    async prepare(
      file: File,
      signal: AbortSignal,
    ): Promise<PreparedListingPhoto> {
      const started = performance.now();
      signal.throwIfAborted();
      const format = await inspectPhoto(file);
      let result: EncodedPhoto;
      let decoder: "native" | "software" = "native";
      try {
        result = await inWorker(file, format, false, signal);
      } catch (error) {
        signal.throwIfAborted();
        if (error instanceof PreparationTerminalError) throw error;
        try {
          result = await nativeElement(file, format, signal);
        } catch (error) {
          signal.throwIfAborted();
          if (error instanceof PreparationTerminalError) throw error;
          if (format !== "image/heic")
            throw new Error(
              "This photo could not be prepared. Export it as JPEG and retry.",
            );
          decoder = "software";
          result = await inWorker(file, format, true, signal);
        }
      }
      signal.throwIfAborted();
      const suffix = result.blob.type === "image/jpeg" ? ".jpg" : ".webp";
      return {
        ...result,
        file: new File(
          [result.blob],
          file.name.replace(/\.[^.]+$/, "") + suffix,
          { type: result.blob.type, lastModified: file.lastModified },
        ),
        decoder,
        originalBytes: file.size,
        preparationMs: performance.now() - started,
      };
    },
  };
}
