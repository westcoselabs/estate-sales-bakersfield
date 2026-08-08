import { createHash } from "node:crypto";

export const DUPLICATE_REVIEW_DIGEST_METADATA_KEY = "candidateDuplicateDigest";

export interface DuplicateReviewFingerprint {
  readonly title: string;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string;
  readonly countryCode: string;
  readonly localStartsAt: string;
  readonly localEndsAt: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timezone: string;
  readonly normalizedTitle: string;
  readonly normalizedAddress: string;
  readonly normalizedCity: string;
  readonly normalizedPostalCode: string;
  readonly locationConfirmationStatus: string;
  readonly latitude: { toString(): string } | number | string | null;
  readonly longitude: { toString(): string } | number | string | null;
}

function coordinate(
  value: DuplicateReviewFingerprint["latitude"],
): string | null {
  return value === null ? null : value.toString();
}

/**
 * Binds a duplicate decision to only the candidate fields that can affect
 * duplicate identity. Editorial-only changes intentionally keep the digest.
 */
export function duplicateReviewContentDigest(
  input: DuplicateReviewFingerprint,
): string {
  const serialized = JSON.stringify([
    input.title,
    input.addressLine1,
    input.addressLine2,
    input.city,
    input.region,
    input.postalCode,
    input.countryCode,
    input.localStartsAt,
    input.localEndsAt,
    input.startsAt,
    input.endsAt,
    input.timezone,
    input.normalizedTitle,
    input.normalizedAddress,
    input.normalizedCity,
    input.normalizedPostalCode,
    input.locationConfirmationStatus,
    coordinate(input.latitude),
    coordinate(input.longitude),
  ]);
  return createHash("sha256").update(serialized, "utf8").digest("hex");
}
