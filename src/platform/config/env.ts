import { z } from "zod";

const appEnvironmentSchema = z.enum(["local", "test", "preview", "production"]);

const providerEnvironmentSchema = z.enum([
  "local",
  "test",
  "preview",
  "production",
]);

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.url().optional(),
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
    UPSTASH_REDIS_REST_URL: optionalUrl,
    UPSTASH_REDIS_REST_TOKEN: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(1).optional(),
    ),
    UPSTASH_RESOURCE_ENV: z.preprocess(
      (value) => (value === "" ? undefined : value),
      providerEnvironmentSchema.optional(),
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
    MAPBOX_ACCESS_TOKEN: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(1).optional(),
    ),
    MAPBOX_RESOURCE_ENV: z.preprocess(
      (value) => (value === "" ? undefined : value),
      providerEnvironmentSchema.optional(),
    ),
    SENTRY_DSN: optionalUrl,
  })
  .superRefine((environment, context) => {
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

    for (const [left, right] of [
      ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
      ["RESEND_API_KEY", "RESEND_FROM"],
    ] as const) {
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
        ["UPSTASH_REDIS_REST_URL", "UPSTASH_RESOURCE_ENV"],
        ["RESEND_API_KEY", "RESEND_RESOURCE_ENV"],
        ["MAPBOX_ACCESS_TOKEN", "MAPBOX_RESOURCE_ENV"],
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
