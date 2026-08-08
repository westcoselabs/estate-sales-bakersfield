import { z } from "zod";

import { validatedSchedule } from "../../events/domain/schedule";
import {
  assertListingImportTimezone,
  normalizeComparableText,
  normalizeDescription,
  normalizedFullAddress,
  normalizeOptionalSingleLine,
  normalizeSingleLine,
} from "../domain/normalization";

const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u;
const LOWER_HEX_DIGEST = /^[0-9a-f]{64}$/u;
const MAXIMUM_LISTING_DURATION_MILLISECONDS = 14 * 24 * 60 * 60 * 1_000;

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
      z.string().min(minimum).max(maximum).nullable(),
    )
    .transform((value) => value ?? null);

export const reviewedListingPrivacySchema = z.enum([
  "APPROXIMATE_LOCATION",
  "EXACT_ADDRESS",
]);

const reviewedScheduleFields = {
  eventType: z.enum(["ESTATE_SALE", "YARD_SALE"]),
  title: singleLine(3, 120),
  description: z
    .string()
    .transform(normalizeDescription)
    .pipe(z.string().min(20).max(5000)),
  localStartsAt: z.string().regex(LOCAL_DATE_TIME),
  localEndsAt: z.string().regex(LOCAL_DATE_TIME),
  timezone: z.string().trim().min(1).max(64),
  privacyMode: reviewedListingPrivacySchema,
} as const;

export const candidateEditSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    ...reviewedScheduleFields,
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
  })
  .strict();

export const externalListingEditSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    ...reviewedScheduleFields,
  })
  .strict();

export const expectedReviewVersionSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();

export const duplicateResolutionSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    resolution: z.enum(["NOT_DUPLICATE", "LINKED"]),
  })
  .strict();

export const candidateReviewDecisionSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export const candidateDeleteSchema = candidateReviewDecisionSchema
  .extend({ confirmation: z.string().trim().min(1).max(120) })
  .strict();

export const externalListingRemovalSchema = candidateReviewDecisionSchema
  .extend({ confirmation: z.string().trim().min(1).max(120) })
  .strict();

export const candidateLocationResolutionSchema = z
  .object({
    precision: z.string().trim().min(1).max(50).nullable(),
    confidence: z.number().finite().min(0).max(1).nullable(),
    validationStatus: z.enum(["VERIFIED", "LOW_CONFIDENCE"]),
  })
  .strict();

export const reviewedCandidatePayloadSchema = z
  .object({
    sourceListingId: z.string().trim().min(1).max(255),
    sourceUrl: z
      .string()
      .url()
      .max(2048)
      .refine((value) => value.startsWith("https://")),
    retrievedAt: z.iso.datetime({ offset: true }),
    contentHash: z.string().regex(LOWER_HEX_DIGEST),
    eventType: z.enum(["ESTATE_SALE", "YARD_SALE"]),
    title: z.string().min(3).max(120),
    description: z.string().min(20).max(5000),
    localStartsAt: z.string().regex(LOCAL_DATE_TIME),
    localEndsAt: z.string().regex(LOCAL_DATE_TIME),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    timezone: z.string().min(1).max(64),
    addressLine1: z.string().min(3).max(200).nullable(),
    addressLine2: z.string().min(1).max(100).nullable(),
    city: z.string().min(2).max(100),
    region: z.string().min(2).max(100),
    postalCode: z.string().min(1).max(20),
    countryCode: z.string().regex(/^[A-Z]{2}$/u),
    privacyMode: reviewedListingPrivacySchema,
    normalizedTitle: z.string().min(1).max(120),
    normalizedAddress: z.string().max(500),
    normalizedCity: z.string().min(1).max(100),
    normalizedPostalCode: z.string().max(20),
    locationResolution: candidateLocationResolutionSchema.nullable().optional(),
  })
  .strict();

export type CandidateEditInput = z.infer<typeof candidateEditSchema>;
export type ExternalListingEditInput = z.infer<
  typeof externalListingEditSchema
>;
export type ReviewedCandidatePayload = z.infer<
  typeof reviewedCandidatePayloadSchema
>;
export type CandidateLocationResolution = z.infer<
  typeof candidateLocationResolutionSchema
>;

export interface NormalizedReviewedListingContent {
  readonly eventType: "ESTATE_SALE" | "YARD_SALE";
  readonly title: string;
  readonly description: string;
  readonly localStartsAt: string;
  readonly localEndsAt: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly timezone: string;
  readonly privacyMode: "APPROXIMATE_LOCATION" | "EXACT_ADDRESS";
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string;
  readonly countryCode: string;
  readonly normalizedTitle: string;
  readonly normalizedAddress: string;
  readonly normalizedCity: string;
  readonly normalizedPostalCode: string;
}

export function normalizeReviewedListingContent(
  input: Omit<CandidateEditInput, "expectedVersion">,
): NormalizedReviewedListingContent {
  assertListingImportTimezone(input.timezone);
  const schedule = validatedSchedule(input);
  if (
    schedule.endsAt.getTime() - schedule.startsAt.getTime() >
    MAXIMUM_LISTING_DURATION_MILLISECONDS
  ) {
    throw new Error("LISTING_REVIEW_SCHEDULE_TOO_LONG");
  }
  const content = {
    eventType: input.eventType,
    title: normalizeSingleLine(input.title),
    description: normalizeDescription(input.description),
    localStartsAt: input.localStartsAt,
    localEndsAt: input.localEndsAt,
    timezone: input.timezone.trim(),
    privacyMode: input.privacyMode,
    addressLine1: normalizeOptionalSingleLine(input.addressLine1),
    addressLine2: normalizeOptionalSingleLine(input.addressLine2),
    city: normalizeSingleLine(input.city),
    region: normalizeSingleLine(input.region),
    postalCode: normalizeSingleLine(input.postalCode),
    countryCode: input.countryCode.trim().toUpperCase(),
  } as const;
  return {
    ...content,
    ...schedule,
    normalizedTitle: normalizeComparableText(content.title),
    normalizedAddress: normalizedFullAddress(content),
    normalizedCity: normalizeComparableText(content.city),
    normalizedPostalCode: normalizeComparableText(content.postalCode),
  };
}

export function normalizeExternalListingContent(
  input: Omit<ExternalListingEditInput, "expectedVersion">,
): Omit<
  NormalizedReviewedListingContent,
  | "addressLine1"
  | "addressLine2"
  | "city"
  | "region"
  | "postalCode"
  | "countryCode"
  | "normalizedAddress"
  | "normalizedCity"
  | "normalizedPostalCode"
> {
  assertListingImportTimezone(input.timezone);
  const schedule = validatedSchedule(input);
  if (
    schedule.endsAt.getTime() - schedule.startsAt.getTime() >
    MAXIMUM_LISTING_DURATION_MILLISECONDS
  ) {
    throw new Error("LISTING_REVIEW_SCHEDULE_TOO_LONG");
  }
  return {
    eventType: input.eventType,
    title: normalizeSingleLine(input.title),
    description: normalizeDescription(input.description),
    localStartsAt: input.localStartsAt,
    localEndsAt: input.localEndsAt,
    ...schedule,
    timezone: input.timezone.trim(),
    privacyMode: input.privacyMode,
    normalizedTitle: normalizeComparableText(input.title),
  };
}

export function reviewedPayloadWithContent(
  current: ReviewedCandidatePayload,
  content: NormalizedReviewedListingContent,
  locationResolution:
    CandidateLocationResolution | null | undefined = current.locationResolution,
): ReviewedCandidatePayload {
  return reviewedCandidatePayloadSchema.parse({
    ...current,
    ...content,
    startsAt: content.startsAt.toISOString(),
    endsAt: content.endsAt.toISOString(),
    locationResolution: locationResolution ?? null,
  });
}
