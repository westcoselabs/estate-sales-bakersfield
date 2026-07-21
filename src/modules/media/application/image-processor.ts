export type ProcessedPhotoVariant =
  "dashboardThumbnail" | "listingCard" | "gallery" | "coverDisplay";

export interface ProcessedImageVariant {
  readonly bytes: Uint8Array;
  readonly contentType: "image/webp";
  readonly sha256: string;
}

export interface ProcessedPhoto {
  readonly width: number;
  readonly height: number;
  readonly variants: Readonly<
    Record<ProcessedPhotoVariant, ProcessedImageVariant>
  >;
}

export interface ImageProcessor {
  process(bytes: Uint8Array): Promise<ProcessedPhoto>;
}
