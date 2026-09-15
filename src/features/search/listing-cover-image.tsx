"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icons";

export function ListingCoverImage({
  src,
  alt,
  priority,
}: {
  readonly src: string;
  readonly alt: string;
  readonly priority: boolean;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  if (failedSource === src)
    return (
      <span
        className="market-listing-card__image-fallback"
        role="img"
        aria-label={alt + " unavailable"}
      >
        <Icon name="photo" size={28} />
        <span>Photo unavailable</span>
      </span>
    );
  return (
    // The private media route provides the optimized, authorized image.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width="800"
      height="600"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      onError={() => setFailedSource(src)}
    />
  );
}
