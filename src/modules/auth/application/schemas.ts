import { z } from "zod";

import { normalizeEmail } from "../domain/email";
import {
  PASSWORD_MAX_CHARACTERS,
  PASSWORD_MIN_CHARACTERS,
} from "./password-policy";

const emailSchema = z
  .string()
  .trim()
  .max(320)
  .email("Enter a valid email address")
  .transform(normalizeEmail);

const passwordSchema = z
  .string()
  .min(
    PASSWORD_MIN_CHARACTERS,
    `Password must contain ${PASSWORD_MIN_CHARACTERS} to ${PASSWORD_MAX_CHARACTERS} characters`,
  )
  .max(
    PASSWORD_MAX_CHARACTERS,
    `Password must contain ${PASSWORD_MIN_CHARACTERS} to ${PASSWORD_MAX_CHARACTERS} characters`,
  );

export const registrationSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2, "Display name must contain 2 to 100 characters")
      .max(100, "Display name must contain 2 to 100 characters"),
    email: emailSchema,
    password: passwordSchema,
    passwordConfirmation: passwordSchema,
    marketingOptIn: z.boolean().optional().default(false),
  })
  .refine((value) => value.password === value.passwordConfirmation, {
    message: "Passwords do not match",
    path: ["passwordConfirmation"],
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().max(128),
});

export const superAdminReauthenticationSchema = z
  .object({
    password: z.string().min(1).max(128),
  })
  .strict();

export const emailRequestSchema = z.object({
  email: emailSchema,
});

export const tokenSchema = z.object({
  token: z.string().min(32).max(512),
});

export const passwordResetSchema = z
  .object({
    token: z.string().min(32).max(512),
    password: passwordSchema,
    passwordConfirmation: passwordSchema,
  })
  .refine((value) => value.password === value.passwordConfirmation, {
    message: "Passwords do not match",
    path: ["passwordConfirmation"],
  });

export type RegistrationInput = z.infer<typeof registrationSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type SuperAdminReauthenticationInput = z.infer<
  typeof superAdminReauthenticationSchema
>;
export type EmailRequestInput = z.infer<typeof emailRequestSchema>;
export type PasswordResetInput = z.infer<typeof passwordResetSchema>;
