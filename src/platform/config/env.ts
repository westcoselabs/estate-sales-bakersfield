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

export const serverEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]),
    APP_ENV: appEnvironmentSchema,
    APP_URL: z.url(),
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
    SENTRY_DSN: optionalUrl,
  })
  .superRefine((environment, context) => {
    if (["preview", "staging", "production"].includes(environment.APP_ENV)) {
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
