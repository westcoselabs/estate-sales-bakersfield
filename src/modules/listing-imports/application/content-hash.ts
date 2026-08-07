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

export function stableJsonDigest(value: unknown): string {
  const hash = createHash("sha256");
  const ancestors = new Set<object>();
  type Frame =
    | { readonly kind: "value"; readonly value: unknown }
    | { readonly kind: "text"; readonly value: string }
    | { readonly kind: "leave"; readonly value: object };
  const stack: Frame[] = [{ kind: "value", value }];

  // Use an explicit stack so hostile but syntactically valid JSON cannot
  // exhaust the JavaScript call stack while an idempotency digest is built.
  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (frame.kind === "text") {
      hash.update(frame.value, "utf8");
      continue;
    }
    if (frame.kind === "leave") {
      ancestors.delete(frame.value);
      continue;
    }

    const current = frame.value;
    if (current === null || typeof current === "string") {
      hash.update(JSON.stringify(current), "utf8");
      continue;
    }
    if (typeof current === "boolean") {
      hash.update(current ? "true" : "false", "utf8");
      continue;
    }
    if (typeof current === "number") {
      hash.update(Number.isFinite(current) ? String(current) : "null", "utf8");
      continue;
    }
    if (typeof current === "bigint") {
      hash.update(JSON.stringify(current.toString()), "utf8");
      continue;
    }
    if (typeof current === "undefined") {
      hash.update("null", "utf8");
      continue;
    }
    if (current instanceof Date) {
      hash.update(JSON.stringify(current.toISOString()), "utf8");
      continue;
    }
    if (typeof current !== "object") {
      hash.update(JSON.stringify(String(current)), "utf8");
      continue;
    }
    if (ancestors.has(current)) {
      hash.update(JSON.stringify("[circular]"), "utf8");
      continue;
    }

    ancestors.add(current);
    stack.push({ kind: "leave", value: current });
    if (Array.isArray(current)) {
      stack.push({ kind: "text", value: "]" });
      for (let index = current.length - 1; index >= 0; index -= 1) {
        stack.push({ kind: "value", value: current[index] });
        if (index > 0) stack.push({ kind: "text", value: "," });
      }
      stack.push({ kind: "text", value: "[" });
      continue;
    }

    const object = current as Readonly<Record<string, unknown>>;
    const keys = Object.keys(object).sort();
    stack.push({ kind: "text", value: "}" });
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index]!;
      stack.push({ kind: "value", value: object[key] });
      stack.push({ kind: "text", value: ":" });
      stack.push({ kind: "text", value: JSON.stringify(key) });
      if (index > 0) stack.push({ kind: "text", value: "," });
    }
    stack.push({ kind: "text", value: "{" });
  }

  return hash.digest("hex");
}
