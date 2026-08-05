import { createHash } from "node:crypto";

import type { CanonicalListingImportContent } from "../domain/types";

export function canonicalListingContent(
  content: CanonicalListingImportContent,
): CanonicalListingImportContent {
  return {
    eventType: content.eventType,
    title: content.title,
    description: content.description,
    localStartsAt: content.localStartsAt,
    localEndsAt: content.localEndsAt,
    timezone: content.timezone,
    addressLine1: content.addressLine1,
    addressLine2: content.addressLine2,
    city: content.city,
    region: content.region,
    postalCode: content.postalCode,
    countryCode: content.countryCode,
    privacyMode: content.privacyMode,
  };
}

export function sha256Digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function listingContentHash(
  content: CanonicalListingImportContent,
): string {
  return sha256Digest(JSON.stringify(canonicalListingContent(content)));
}

function stableValue(value: unknown, seen: Set<object>): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "undefined") return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    const result = value.map((entry) => stableValue(entry, seen));
    seen.delete(value);
    return result;
  }
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[circular]";

  seen.add(value);
  const object = value as Readonly<Record<string, unknown>>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(object).sort()) {
    result[key] = stableValue(object[key], seen);
  }
  seen.delete(value);
  return result;
}

export function stableJsonDigest(value: unknown): string {
  return sha256Digest(JSON.stringify(stableValue(value, new Set())));
}
