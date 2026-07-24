import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import type { AddressSuggestion } from "../domain/types";
import { LocationProviderError } from "../domain/errors";

interface SelectionTokenPayload {
  readonly issuedAt: number;
  readonly suggestion: AddressSuggestion;
}

const MAXIMUM_AGE_MS = 30 * 60 * 1000;

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(payload, "utf8")
    .digest("base64url");
}

export function createLocationSelectionToken(
  suggestion: AddressSuggestion,
  secret: string,
  now = new Date(),
): string {
  const payload = Buffer.from(
    JSON.stringify({ issuedAt: now.getTime(), suggestion }),
    "utf8",
  ).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyLocationSelectionToken(
  token: string,
  secret: string,
  now = new Date(),
): AddressSuggestion {
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) {
    throw new LocationProviderError("The selected address has expired");
  }
  const expected = signature(payload, secret);
  const left = Buffer.from(suppliedSignature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new LocationProviderError("The selected address is invalid");
  }
  let parsed: SelectionTokenPayload;
  try {
    parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as SelectionTokenPayload;
  } catch {
    throw new LocationProviderError("The selected address is invalid");
  }
  if (
    !Number.isFinite(parsed.issuedAt) ||
    parsed.issuedAt > now.getTime() + 60_000 ||
    now.getTime() - parsed.issuedAt > MAXIMUM_AGE_MS ||
    !parsed.suggestion ||
    !Number.isFinite(parsed.suggestion.latitude) ||
    !Number.isFinite(parsed.suggestion.longitude)
  ) {
    throw new LocationProviderError("The selected address has expired");
  }
  return parsed.suggestion;
}
