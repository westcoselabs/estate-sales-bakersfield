import { z } from "zod";

const optionalBoundedText = (minimum: number, maximum: number) =>
  z.preprocess(
    (value) => (value === "" || value === undefined ? null : value),
    z.string().trim().min(minimum).max(maximum).nullable(),
  );

const optionalEmail = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z
    .string()
    .trim()
    .max(320)
    .email()
    .transform((email) => email.toLowerCase())
    .nullable(),
);

const optionalWebsite = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.url().max(2048).nullable(),
);

export const organizerProfileSchema = z.object({
  displayName: optionalBoundedText(2, 100),
  contactName: optionalBoundedText(2, 100),
  contactEmail: optionalEmail,
  contactPhone: optionalBoundedText(7, 32),
  websiteUrl: optionalWebsite,
});

export type OrganizerProfileInput = z.infer<typeof organizerProfileSchema>;
