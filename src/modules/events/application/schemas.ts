import { z } from "zod";

import type { AddressSuggestion } from "@/modules/locations";

const optionalTrimmed = (minimum: number, maximum: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? null : value,
    z.string().trim().min(minimum).max(maximum).nullable(),
  );

export const eventTypeSchema = z.enum(["ESTATE_SALE", "YARD_SALE"]);
export const addressPrivacySchema = z.enum([
  "EXACT_ADDRESS",
  "APPROXIMATE_LOCATION",
  "HIDDEN_UNTIL_START",
]);
export const expectedVersionSchema = z.number().int().positive();

export const createEventSchema = z.object({ eventType: eventTypeSchema });

export const BAKERSFIELD_TIMEZONE = "America/Los_Angeles";

export const eventDetailsSchema = z.object({
  expectedVersion: expectedVersionSchema,
  title: optionalTrimmed(3, 120),
  description: optionalTrimmed(20, 5000),
});

export const eventScheduleSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    localStartsAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
      .optional(),
    localEndsAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
      .optional(),
    scheduleDays: z
      .array(
        z.object({
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          startTime: z.string().regex(/^\d{2}:\d{2}$/),
          endTime: z.string().regex(/^\d{2}:\d{2}$/),
        }),
      )
      .min(1)
      .max(366)
      .optional(),
    timezone: z.literal(BAKERSFIELD_TIMEZONE),
  })
  .refine(
    (input) => input.scheduleDays || (input.localStartsAt && input.localEndsAt),
    {
      message: "Select event dates and opening and closing times.",
      path: ["scheduleDays"],
    },
  );

export const eventLocationSchema = z.object({
  expectedVersion: expectedVersionSchema,
  addressLine1: z.string().trim().min(3).max(200),
  addressLine2: optionalTrimmed(1, 100),
  city: z.string().trim().min(2).max(100),
  region: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().max(20),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/),
  timezone: z.literal(BAKERSFIELD_TIMEZONE),
  privacyMode: addressPrivacySchema,
  localAddressRevealAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  selectionToken: z.string().min(40).max(4096).nullable().optional(),
  confirmed: z.boolean().optional(),
  pinLatitude: z.number().finite().min(-90).max(90).optional(),
  pinLongitude: z.number().finite().min(-180).max(180).optional(),
});

export const photoReservationSchema = z.object({
  expectedVersion: expectedVersionSchema,
  contentType: z.enum([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
  ]),
  fileName: z.string().trim().min(1).max(160),
});

export const photoFinalizationSchema = z.object({
  expectedVersion: expectedVersionSchema,
  reservationId: z.uuid(),
  pathname: z.string().min(1).max(500),
});

export const photoUploadClientPayloadSchema = z.object({
  expectedVersion: expectedVersionSchema,
  reservationId: z.uuid(),
  photoId: z.uuid(),
});

export const photoOrderSchema = z.object({
  expectedVersion: expectedVersionSchema,
  photoIds: z.array(z.uuid()).min(1).max(150),
});

export const photoMutationSchema = z.object({
  expectedVersion: expectedVersionSchema,
});

export const eventLifecycleMutationSchema = z.object({
  expectedVersion: expectedVersionSchema,
  confirmation: z.string().trim().min(1).max(120),
});

export const eventApprovalSchema = z.object({
  expectedVersion: expectedVersionSchema,
  acceptedTerms: z.literal(true),
  termsVersion: z.string().max(50),
});

export type EventDetailsInput = z.infer<typeof eventDetailsSchema>;
export type EventScheduleInput = z.infer<typeof eventScheduleSchema>;
export type EventLocationInput = z.infer<typeof eventLocationSchema> & {
  readonly selectedLocation?: AddressSuggestion;
};
