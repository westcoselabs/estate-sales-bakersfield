import {
  assertIanaTimezone,
  validatedSchedule,
} from "../../events/domain/schedule";

import { ListingImportRowError } from "./errors";
import type {
  CanonicalListingImportContent,
  ListingImportEventType,
  ListingImportPrivacyMode,
} from "./types";

const WHITESPACE = /\s+/gu;
const HORIZONTAL_WHITESPACE = /[^\S\n]+/gu;
const EXCESS_BLANK_LINES = /\n{3,}/gu;
const REPEATED_PATH_SEPARATOR = /\/{2,}/gu;
const PERCENT_ESCAPE = /%[0-9a-f]{2}/giu;
const SAFE_PERCENT_DECODE = /^[A-Za-z0-9_~-]$/u;
const MAX_SOURCE_URL_LENGTH = 2_048;

export function normalizeSingleLine(value: string): string {
  return value.normalize("NFC").replace(WHITESPACE, " ").trim();
}

export function normalizeDescription(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.replace(HORIZONTAL_WHITESPACE, " ").trim())
    .join("\n")
    .trim()
    .replace(EXCESS_BLANK_LINES, "\n\n");
}

export function normalizeOptionalSingleLine(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  const normalized = normalizeSingleLine(value);
  return normalized.length === 0 ? null : normalized;
}

export function normalizeComparableText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Mark}+/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(WHITESPACE, " ");
}

export function normalizedFullAddress(input: {
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string;
  readonly countryCode: string;
}): string {
  if (!input.addressLine1) return "";
  return normalizeComparableText(
    [
      input.addressLine1,
      input.addressLine2,
      input.city,
      input.region,
      input.postalCode,
      input.countryCode,
    ]
      .filter((part): part is string => Boolean(part))
      .join(" "),
  );
}

export function assertListingImportTimezone(timezone: string): void {
  try {
    assertIanaTimezone(timezone);
  } catch (error) {
    throw new ListingImportRowError(
      "TIMEZONE_INVALID",
      "The listing timezone is invalid.",
      { cause: error },
    );
  }
}

function canonicalPercentEncoding(value: string): string {
  return value.replace(PERCENT_ESCAPE, (escape) => {
    const character = String.fromCharCode(Number.parseInt(escape.slice(1), 16));
    return SAFE_PERCENT_DECODE.test(character)
      ? character
      : escape.toUpperCase();
  });
}

function normalizeAllowedHost(value: string): string | null {
  const candidate = value.trim().toLocaleLowerCase("en-US");
  if (!candidate || /[/@?#]/u.test(candidate)) return null;
  try {
    const parsed = new URL(`https://${candidate}`);
    const hostname = parsed.hostname.replace(/\.$/u, "");
    return parsed.port ? `${hostname}:${parsed.port}` : hostname;
  } catch {
    return null;
  }
}

export function canonicalizeSourceUrl(
  value: string,
  policy: {
    readonly allowedHosts: readonly string[];
    readonly allowedQueryParameters: readonly string[];
  },
): string {
  const raw = value.trim();
  if (raw.includes("#")) {
    throw new ListingImportRowError("SOURCE_URL_INVALID");
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch (error) {
    throw new ListingImportRowError(
      "SOURCE_URL_INVALID",
      "The source URL is invalid.",
      { cause: error },
    );
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username.length > 0 ||
    parsed.password.length > 0
  ) {
    throw new ListingImportRowError("SOURCE_URL_INVALID");
  }

  const hostname = parsed.hostname
    .toLocaleLowerCase("en-US")
    .replace(/\.$/u, "");
  const host = parsed.port ? `${hostname}:${parsed.port}` : hostname;
  const allowedHosts = new Set(
    policy.allowedHosts
      .map(normalizeAllowedHost)
      .filter((entry): entry is string => entry !== null),
  );
  if (!allowedHosts.has(host)) {
    throw new ListingImportRowError("SOURCE_HOST_NOT_ALLOWED");
  }

  const allowedQueryParameters = new Set(policy.allowedQueryParameters);
  const queryEntries = [...parsed.searchParams.entries()];
  if (queryEntries.some(([key]) => !allowedQueryParameters.has(key))) {
    throw new ListingImportRowError("SOURCE_QUERY_PARAMETER_NOT_ALLOWED");
  }
  queryEntries.sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    const keyOrder = leftKey.localeCompare(rightKey, "en");
    return keyOrder !== 0
      ? keyOrder
      : leftValue.localeCompare(rightValue, "en");
  });

  const canonicalQuery = new URLSearchParams();
  for (const [key, queryValue] of queryEntries) {
    canonicalQuery.append(key, queryValue.normalize("NFC"));
  }

  let pathname = canonicalPercentEncoding(
    parsed.pathname.replace(REPEATED_PATH_SEPARATOR, "/"),
  );
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/u, "");
  if (pathname.length === 0) pathname = "/";

  const canonical = `https://${host}${pathname}`;
  const query = canonicalQuery.toString();
  const result = query.length > 0 ? `${canonical}?${query}` : canonical;
  if (result.length > MAX_SOURCE_URL_LENGTH) {
    throw new ListingImportRowError("SOURCE_URL_INVALID");
  }
  return result;
}

export function normalizeListingContent(input: {
  readonly eventType: ListingImportEventType;
  readonly title: string;
  readonly description: string;
  readonly localStartsAt: string;
  readonly localEndsAt: string;
  readonly timezone: string;
  readonly addressLine1?: string | null;
  readonly addressLine2?: string | null;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string;
  readonly countryCode: string;
  readonly privacyMode: ListingImportPrivacyMode;
}): CanonicalListingImportContent & {
  readonly startsAt: Date;
  readonly endsAt: Date;
} {
  const content: CanonicalListingImportContent = {
    eventType: input.eventType,
    title: normalizeSingleLine(input.title),
    description: normalizeDescription(input.description),
    localStartsAt: input.localStartsAt,
    localEndsAt: input.localEndsAt,
    timezone: input.timezone.trim(),
    addressLine1: normalizeOptionalSingleLine(input.addressLine1),
    addressLine2: normalizeOptionalSingleLine(input.addressLine2),
    city: normalizeSingleLine(input.city),
    region: normalizeSingleLine(input.region),
    postalCode: normalizeSingleLine(input.postalCode),
    countryCode: input.countryCode.trim().toUpperCase(),
    privacyMode: input.privacyMode,
  };
  const schedule = validatedSchedule(content);
  return { ...content, ...schedule };
}
