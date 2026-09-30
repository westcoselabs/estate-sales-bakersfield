declare module "libheif-js/libheif-wasm/libheif-bundle.mjs" {
  interface HeifImage {
    get_width(): number;
    get_height(): number;
    is_primary(): boolean;
    display(
      image: ImageData,
      callback: (result: ImageData | null) => void,
    ): void;
    free(): void;
  }
  interface HeifDecoder {
    decoder: number | null;
    decode(bytes: Uint8Array): HeifImage[];
  }
  interface Libheif {
    HeifDecoder: new () => HeifDecoder;
    heif_context_free(context: number): void;
  }
  export default function createLibheif(): Promise<Libheif>;
}
