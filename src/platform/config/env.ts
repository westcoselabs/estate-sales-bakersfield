import { z } from "zod";

const appEnvironmentSchema = z.enum([
  "local",
  "test",
  "preview",
  "staging",
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
    DATABASE_DRIVER: z.enum(["pg", "neon"]).default("pg"),
    DATABASE_URL: optionalUrl,
    DIRECT_URL: optionalUrl,
    CRON_SECRET: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(32).optional(),
    ),
    BLOB_READ_WRITE_TOKEN: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(1).optional(),
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
    RESEND_API_KEY: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(1).optional(),
    ),
    RESEND_FROM: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(3).max(320).optional(),
    ),
    AUTH_EMAIL_CAPTURE_PATH: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(1).optional(),
    ),
    SENTRY_DSN: optionalUrl,
  })
  .superRefine((environment, context) => {
    if (["preview", "staging", "production"].includes(environment.APP_ENV)) {
      if (new URL(environment.APP_URL).protocol !== "https:") {
        context.addIssue({
          code: "custom",
          message: `APP_URL must use HTTPS in ${environment.APP_ENV}`,
          path: ["APP_URL"],
        });
      }
      if (environment.DATABASE_DRIVER !== "neon") {
        context.addIssue({
          code: "custom",
          message:
            "DATABASE_DRIVER must be neon outside local and test environments",
          path: ["DATABASE_DRIVER"],
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
