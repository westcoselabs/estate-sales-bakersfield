// Account budgets include retained media from canceled/deleted events until
// purge succeeds, so creating or deleting drafts cannot bypass storage limits.
export const MAXIMUM_ACTIVE_DRAFTS_PER_ACCOUNT = 20;
export const MAXIMUM_RETAINED_PHOTOS_PER_ACCOUNT = 300;
export const MAXIMUM_SOURCE_BYTES_PER_ACCOUNT = 2 * 1024 * 1024 * 1024;
export const MAXIMUM_RESERVED_PHOTO_BYTES = 15 * 1024 * 1024;
export const MAXIMUM_ACCOUNT_PHOTO_PROCESSING = 2;
export const PHOTO_PROCESSING_LEASE_MS = 10 * 60_000;
export const PHOTO_PROCESSING_PURGE_GRACE_MS = 60_000;

export const EVENT_OPERATION_LIMITS = {
  create: { limit: 10, windowSeconds: 60 * 60 },
  // Admit one full 150-photo listing batch plus a bounded retry allowance.
  // Native runtime slots, per-account processing leases, and retained-media
  // count/byte budgets still gate each reservation and decoded image.
  reserve: { limit: 180, windowSeconds: 60 },
  finalize: { limit: 180, windowSeconds: 60 },
} as const;

export type EventOperation = keyof typeof EVENT_OPERATION_LIMITS;
