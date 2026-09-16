import type { Metadata } from "next";

export function publicIndexingEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return (
    environment.PUBLIC_INDEXING_ENABLED === "true" &&
    environment.APP_ENV === "production"
  );
}

// Imported pages need a separate content/source-quality approval before they
// join the index. Public launch alone does not approve syndicated inventory.
export function importedListingIndexingEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return (
    publicIndexingEnabled(environment) &&
    environment.PUBLIC_IMPORTED_INDEXING_ENABLED === "true"
  );
}

/**
 * Public pages remain noindex unless the explicit launch opt-in and every
 * production condition are present. Payment mode is independent. Search and private pages retain
 * their own noindex policy even after launch.
 */
export const prelaunchRobots: NonNullable<Metadata["robots"]> = {
  index: false,
  follow: true,
  googleBot: {
    index: false,
    follow: true,
    noimageindex: false,
  },
};

export function publicRobots(): NonNullable<Metadata["robots"]> {
  return publicIndexingEnabled()
    ? {
        index: true,
        follow: true,
        googleBot: { index: true, follow: true, "max-image-preview": "large" },
      }
    : prelaunchRobots;
}

export const sensitiveRobots: NonNullable<Metadata["robots"]> = {
  index: false,
  follow: false,
  noarchive: true,
  googleBot: {
    index: false,
    follow: false,
    noimageindex: true,
  },
};

export const sensitiveMetadata: Metadata = {
  robots: sensitiveRobots,
};

/**
 * Search/filter URLs remain utility pages even after a future public launch.
 */
export const searchRobots: NonNullable<Metadata["robots"]> = {
  index: false,
  follow: true,
  noarchive: true,
  googleBot: {
    index: false,
    follow: true,
    noimageindex: false,
  },
};
