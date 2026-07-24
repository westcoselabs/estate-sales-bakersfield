import type { Metadata } from "next";

const socialImage = {
  url: "/images/marketplace-hero.webp",
  width: 1774,
  height: 887,
  alt: "A warm Bakersfield home interior with vintage furniture",
};

export function marketingMetadata(input: {
  readonly title: string;
  readonly description: string;
  readonly path: string;
}): Metadata {
  return {
    title: input.title,
    description: input.description,
    alternates: { canonical: input.path },
    openGraph: {
      type: "website",
      title: input.title,
      description: input.description,
      url: input.path,
      images: [socialImage],
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
      images: [socialImage.url],
    },
  };
}
