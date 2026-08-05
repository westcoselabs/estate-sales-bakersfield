import { z } from "zod";

import {
  normalizeDescription,
  normalizeOptionalSingleLine,
  normalizeSingleLine,
} from "../domain/normalization";
import {
  LISTING_IMPORT_CONTRACT_VERSION,
  type ListingImportValidationCode,
} from "../domain/types";

const localDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u;
const lowerHexDigest = /^[0-9a-f]{64}$/u;

const singleLine = (minimum: number, maximum: number) =>
  z
    .string()
    .transform(normalizeSingleLine)
    .pipe(z.string().min(minimum).max(maximum));

const optionalSingleLine = (minimum: number, maximum: number) =>
  z
    .preprocess(
      (value) =>
        typeof value === "string" ? normalizeOptionalSingleLine(value) : value,
      z.string().min(minimum).max(maximum).nullable().optional(),
    )
    .transform((value) => value ?? null);

export const listingImportEnvelopeSchema = z
  .object({
    contractVersion: z.literal(LISTING_IMPORT_CONTRACT_VERSION),
    sourceKey: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u),
    ingestorRunId: z.string().trim().min(1).max(100),
    ingestorInstanceId: z.string().trim().min(1).max(100),
    parserVersion: z.string().trim().min(1).max(100),
    items: z.array(z.unknown()).min(1).max(200),
  })
  .strict();

export const listingImportItemSchema = z
  .object({
    sourceListingId: z.string().trim().min(1).max(255),
    sourceUrl: z.string().trim().min(1).max(2048),
    retrievedAt: z.string().datetime({ offset: true }),
    contentHash: z.string().regex(lowerHexDigest),
    eventType: z.enum(["ESTATE_SALE", "YARD_SALE"]),
    title: singleLine(3, 120),
    description: z
      .string()
      .transform(normalizeDescription)
      .pipe(z.string().min(20).max(5000)),
    localStartsAt: z.string().regex(localDateTime),
    localEndsAt: z.string().regex(localDateTime),
    timezone: z.string().trim().min(1).max(64),
    addressLine1: optionalSingleLine(3, 200),
    addressLine2: optionalSingleLine(1, 100),
    city: singleLine(2, 100),
    region: singleLine(2, 100),
    postalCode: singleLine(1, 20),
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/u),
    privacyMode: z.literal("APPROXIMATE_LOCATION"),
  })
  .strict();

export type ListingImportItemInput = z.infer<typeof listingImportItemSchema>;

const issueCodeByField: Readonly<Record<string, ListingImportValidationCode>> =
  {
    sourceListingId: "SOURCE_LISTING_ID_INVALID",
    sourceUrl: "SOURCE_URL_INVALID",
    retrievedAt: "RETRIEVED_AT_INVALID",
    contentHash: "CONTENT_HASH_INVALID",
    eventType: "EVENT_TYPE_INVALID",
    title: "TITLE_INVALID",
    description: "DESCRIPTION_INVALID",
    localStartsAt: "LOCAL_STARTS_AT_INVALID",
    localEndsAt: "LOCAL_ENDS_AT_INVALID",
    timezone: "TIMEZONE_INVALID",
    addressLine1: "ADDRESS_LINE_1_INVALID",
    addressLine2: "ADDRESS_LINE_2_INVALID",
    city: "CITY_INVALID",
    region: "REGION_INVALID",
    postalCode: "POSTAL_CODE_INVALID",
    countryCode: "COUNTRY_CODE_INVALID",
    privacyMode: "PRIVACY_MODE_INVALID",
  };

export function itemValidationCodes(
  error: z.ZodError,
): readonly ListingImportValidationCode[] {
  const codes = new Set<ListingImportValidationCode>();
  for (const issue of error.issues) {
    const field = issue.path[0];
    codes.add(
      typeof field === "string"
        ? (issueCodeByField[field] ?? "ITEM_INVALID")
        : "ITEM_INVALID",
    );
  }
  return [...codes];
}
