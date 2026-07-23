import type { Metadata } from "next";

/**
 * Indexing is intentionally fail-closed until a separate, owner-approved
 * public-launch change replaces this policy.
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
