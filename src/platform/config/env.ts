import { z } from "zod";

const appEnvironmentSchema = z.enum(["local", "test", "preview", "production"]);

const providerEnvironmentSchema = z.enum([
  "local",
  "test",
  "preview",
  "production",
]);

const optionalBooleanFlag = z.preprocess(
  (value) => (value === "" || value === undefined ? "false" : value),
  z.enum(["true", "false"]).transform((value) => value === "true"),
);

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.url().optional(),
);

const optionalPositiveInteger = z.preprocess(
  (value) =>
    value === "" || value === undefined
      ? undefined
      : typeof value === "string"
        ? Number(value)
        : value,
  z.number().int().positive().max(999_999_999).optional(),
);

const applicationUrl = z.url().superRefine((value, context) => {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    context.addIssue({
      code: "custom",
      message: "APP_URL must use HTTP or HTTPS",
    });
  }
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    context.addIssue({
      code: "custom",
      message: "APP_URL must contain only an application origin",
    });
  }
});

export const serverEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]),
    APP_ENV: appEnvironmentSchema,
    PRODUCTION_BETA_MODE: optionalBooleanFlag,
    APP_URL: applicationUrl,
    LOG_LEVEL: z.enum([
      "silent",
      "fatal",
      "error",
      "warn",
      "info",
      "debug",
      "trace",
    ]),
    DATABASE_URL: optionalUrl,
    DIRECT_URL: optionalUrl,
    DATABASE_RESOURCE_ENV: z.preprocess(
      (value) => (value === "" ? undefined : value),
      providerEnvironmentSchema.optional(),
    ),
    TEST_DATABASE_URL: optionalUrl,
    TEST_DIRECT_URL: optionalUrl,
    TEST_NEON_ENDPOINT_ID: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z
        .string()
        .regex(/^ep-[a-z0-9-]{6,80}$/)
        .optional(),
    ),
    TEST_DATABASE_CONFIRMATION: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().max(100).optional(),
    ),
    TEST_DATABASE_RESET_CONFIRMATION: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().max(100).optional(),
    ),
    TEST_RUN_ID: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z
        .string()
        .regex(/^testrun-[a-z0-9-]+$/)
        .max(100)
        .optional(),
    ),
    CRON_SECRET: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(32).optional(),
    ),
    BLOB_READ_WRITE_TOKEN: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(1).optional(),
    ),
    BLOB_RESOURCE_ENV: z.preprocess(
      (value) => (value === "" ? undefined : value),
      providerEnvironmentSchema.optional(),
    ),
    AUTH_FINGERPRINT_SECRET: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(32).optional(),
    ),
    RESEND_API_KEY: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(1).optional(),
    ),
    RESEND_FROM: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(3).max(320).optional(),
    ),
    RESEND_RESOURCE_ENV: z.preprocess(
      (value) => (value === "" ? undefined : value),
      providerEnvironmentSchema.optional(),
    ),
    RESEND_WEBHOOK_SECRET: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(16).optional(),
    ),
    EMAIL_CAMPAIGNS_ENABLED: optionalBooleanFlag,
    AUTH_EMAIL_CAPTURE_PATH: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(1).optional(),
    ),
    TEST_MEDIA_ROOT: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(1).optional(),
    ),
    TEST_MEDIA_SIGNING_SECRET: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(32).optional(),
    ),
    TEST_LOCATION_FIXTURES: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(1).max(100).optional(),
    ),
    GEOAPIFY_API_KEY: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(16).max(255).optional(),
    ),
    NEXT_PUBLIC_MAP_STYLE_URL: optionalUrl,
    STRIPE_SECRET_KEY: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(16).optional(),
    ),
    STRIPE_WEBHOOK_SECRET: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(16).optional(),
    ),
    STRIPE_PRICE_ID: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z
        .string()
        .regex(/^price_[A-Za-z0-9_]+$/)
        .max(255)
        .optional(),
    ),
    STRIPE_EXPECTED_AMOUNT: optionalPositiveInteger,
    STRIPE_EXPECTED_CURRENCY: z.preprocess(
      (value) =>
        typeof value === "string" && value !== ""
          ? value.toLowerCase()
          : undefined,
      z
        .string()
        .regex(/^[a-z]{3}$/)
        .optional(),
    ),
    STRIPE_MODE: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.enum(["test", "live"]).optional(),
    ),
    STRIPE_RESOURCE_ENV: z.preprocess(
      (value) => (value === "" ? undefined : value),
      providerEnvironmentSchema.optional(),
    ),
    SENTRY_DSN: optionalUrl,
  })
  .superRefine((environment, context) => {
    if (
      environment.PRODUCTION_BETA_MODE &&
      environment.APP_ENV !== "production"
    ) {
      context.addIssue({
        code: "custom",
        message: "PRODUCTION_BETA_MODE may be enabled only in production",
        path: ["PRODUCTION_BETA_MODE"],
      });
    }

    if (["preview", "production"].includes(environment.APP_ENV)) {
      if (new URL(environment.APP_URL).protocol !== "https:") {
        context.addIssue({
          code: "custom",
          message: `APP_URL must use HTTPS in ${environment.APP_ENV}`,
          path: ["APP_URL"],
        });
      }
      for (const key of [
        "DATABASE_URL",
        "DIRECT_URL",
        "CRON_SECRET",
      ] as const) {
        if (!environment[key]) {
          context.addIssue({
            code: "custom",
            message: `${key} is required in ${environment.APP_ENV}`,
            path: [key],
          });
        }
      }
    }

    if (
      environment.APP_ENV === "production" &&
      environment.RESEND_API_KEY &&
      !environment.RESEND_WEBHOOK_SECRET
    ) {
      context.addIssue({
        code: "custom",
        message:
          "RESEND_WEBHOOK_SECRET is required when Resend is configured in production",
        path: ["RESEND_WEBHOOK_SECRET"],
      });
    }

    if (
      environment.EMAIL_CAMPAIGNS_ENABLED &&
      (environment.APP_ENV !== "production" ||
        environment.RESEND_RESOURCE_ENV !== "production")
    ) {
      context.addIssue({
        code: "custom",
        message:
          "EMAIL_CAMPAIGNS_ENABLED requires production application and Resend resources",
        path: ["EMAIL_CAMPAIGNS_ENABLED"],
      });
    }

    if (environment.APP_ENV === "production") {
      for (const key of [
        "GEOAPIFY_API_KEY",
        "NEXT_PUBLIC_MAP_STYLE_URL",
      ] as const) {
        if (!environment[key]) {
          context.addIssue({
            code: "custom",
            message: `${key} is required in production`,
            path: [key],
          });
        }
      }
    }

    if (
      environment.NEXT_PUBLIC_MAP_STYLE_URL &&
      new URL(environment.NEXT_PUBLIC_MAP_STYLE_URL).protocol !== "https:"
    ) {
      context.addIssue({
        code: "custom",
        message: "NEXT_PUBLIC_MAP_STYLE_URL must use HTTPS",
        path: ["NEXT_PUBLIC_MAP_STYLE_URL"],
      });
    }

    for (const [left, right] of [["RESEND_API_KEY", "RESEND_FROM"]] as const) {
      if (Boolean(environment[left]) !== Boolean(environment[right])) {
        context.addIssue({
          code: "custom",
          message: `${left} and ${right} must be configured together`,
          path: [left],
        });
      }
    }

    if (["preview", "production"].includes(environment.APP_ENV)) {
      const configuredProviders = [
        ["DATABASE_URL", "DATABASE_RESOURCE_ENV"],
        ["BLOB_READ_WRITE_TOKEN", "BLOB_RESOURCE_ENV"],
        ["RESEND_API_KEY", "RESEND_RESOURCE_ENV"],
        ["STRIPE_SECRET_KEY", "STRIPE_RESOURCE_ENV"],
      ] as const;
      for (const [credential, marker] of configuredProviders) {
        if (
          environment[credential] &&
          environment[marker] !== environment.APP_ENV
        ) {
          context.addIssue({
            code: "custom",
            message: `${marker} must match APP_ENV when ${credential} is configured`,
            path: [marker],
          });
        }
      }
    }

    const stripeKeys = [
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PRICE_ID",
      "STRIPE_EXPECTED_AMOUNT",
      "STRIPE_EXPECTED_CURRENCY",
      "STRIPE_MODE",
      "STRIPE_RESOURCE_ENV",
    ] as const;
    const stripeConfigured = stripeKeys.filter(
      (key) => environment[key] !== undefined,
    );
    if (
      stripeConfigured.length > 0 &&
      stripeConfigured.length !== stripeKeys.length
    ) {
      for (const key of stripeKeys) {
        if (environment[key] === undefined) {
          context.addIssue({
            code: "custom",
            message: `${key} is required when Stripe is configured`,
            path: [key],
          });
        }
      }
    }
    if (stripeConfigured.length === stripeKeys.length) {
      if (
        environment.APP_ENV === "preview" &&
        (environment.STRIPE_MODE !== "test" ||
          !environment.STRIPE_SECRET_KEY?.startsWith("sk_test_"))
      ) {
        context.addIssue({
          code: "custom",
          message: "Vercel Preview may use only Stripe test mode",
          path: ["STRIPE_MODE"],
        });
      }
      if (
        environment.APP_ENV === "production" &&
        environment.PRODUCTION_BETA_MODE &&
        (environment.STRIPE_MODE !== "test" ||
          !environment.STRIPE_SECRET_KEY?.startsWith("sk_test_"))
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Production beta Stripe configuration must use test mode and a test secret key",
          path: ["STRIPE_MODE"],
        });
      }
      if (
        environment.APP_ENV === "production" &&
        !environment.PRODUCTION_BETA_MODE &&
        (environment.STRIPE_MODE !== "live" ||
          !environment.STRIPE_SECRET_KEY?.startsWith("sk_live_"))
      ) {
        context.addIssue({
          code: "custom",
          message: "Production Stripe configuration must be explicitly live",
          path: ["STRIPE_MODE"],
        });
      }
      if (!environment.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_")) {
        context.addIssue({
          code: "custom",
          message: "STRIPE_WEBHOOK_SECRET must be a Stripe endpoint secret",
          path: ["STRIPE_WEBHOOK_SECRET"],
        });
      }
    }

    if (
      environment.APP_ENV === "test" &&
      (environment.STRIPE_SECRET_KEY || environment.STRIPE_WEBHOOK_SECRET)
    ) {
      context.addIssue({
        code: "custom",
        message: "APP_ENV=test cannot use real Stripe credentials",
        path: ["STRIPE_SECRET_KEY"],
      });
    }

    if (
      environment.AUTH_EMAIL_CAPTURE_PATH &&
      !["local", "test"].includes(environment.APP_ENV)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "AUTH_EMAIL_CAPTURE_PATH is permitted only in local or test environments",
        path: ["AUTH_EMAIL_CAPTURE_PATH"],
      });
    }

    if (
      environment.APP_ENV !== "test" &&
      (environment.TEST_MEDIA_ROOT || environment.TEST_MEDIA_SIGNING_SECRET)
    ) {
      context.addIssue({
        code: "custom",
        message: "Test media configuration is permitted only in APP_ENV=test",
        path: ["TEST_MEDIA_ROOT"],
      });
    }

    if (environment.APP_ENV !== "test" && environment.TEST_RUN_ID) {
      context.addIssue({
        code: "custom",
        message: "TEST_RUN_ID is permitted only in APP_ENV=test",
        path: ["TEST_RUN_ID"],
      });
    }
  });

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

let cachedEnvironment: ServerEnvironment | undefined;

export function parseServerEnvironment(
  input: Record<string, string | undefined>,
): ServerEnvironment {
  return serverEnvironmentSchema.parse(input);
}

export function getServerEnvironment(): ServerEnvironment {
  cachedEnvironment ??= parseServerEnvironment(process.env);
  return cachedEnvironment;
}

export function resetEnvironmentCacheForTests(): void {
  cachedEnvironment = undefined;
}
