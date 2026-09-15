import { ZodError } from "zod";

import { parseServerEnvironment } from "../src/platform/config/env";

export type ReleaseStage = "preparation" | "public-launch";

/** Configuration-only check. It does not contact providers, load env files,
 * authorize deployment, or claim that operational/business gates passed. */
export function checkReleaseConfiguration(
  input: Record<string, string | undefined>,
  stage: ReleaseStage,
) {
  const blockers: string[] = [];
  let environment;
  try {
    environment = parseServerEnvironment(input);
  } catch (error) {
    const fields =
      error instanceof ZodError
        ? [...new Set(error.issues.map((issue) => issue.path.join(".")))].sort()
        : ["environment"];
    return {
      scope: "configuration-only",
      stage,
      configuration: "blocked",
      invalidFields: fields,
      blockers: ["Environment validation failed."],
      operationalEvidence: "not-verified",
    };
  }

  if (stage === "preparation") {
    if (environment.PUBLIC_INDEXING_ENABLED)
      blockers.push("Public indexing must remain disabled during preparation.");
    if (environment.STRIPE_MODE === "live")
      blockers.push(
        "Live Stripe is deferred until the application is complete.",
      );
    if (environment.EMAIL_CAMPAIGNS_ENABLED)
      blockers.push(
        "Campaign dispatch must remain disabled during preparation.",
      );
  } else {
    if (environment.APP_ENV !== "production")
      blockers.push("Public launch requires the production environment.");
    if (environment.PRODUCTION_BETA_MODE)
      blockers.push("The beta gate is still enabled.");
    if (environment.STRIPE_MODE !== "live")
      blockers.push(
        "Live Stripe verification is deferred and has not been completed.",
      );
    if (!environment.PUBLIC_INDEXING_ENABLED)
      blockers.push("The explicit public-indexing gate is disabled.");
    const required = [
      "DATABASE_URL",
      "DIRECT_URL",
      "BLOB_READ_WRITE_TOKEN",
      "AUTH_FINGERPRINT_SECRET",
      "PUBLIC_SUPPORT_EMAIL",
      "CRON_SECRET",
      "GEOAPIFY_API_KEY",
      "NEXT_PUBLIC_MAP_STYLE_URL",
      "RESEND_API_KEY",
      "RESEND_FROM",
      "RESEND_WEBHOOK_SECRET",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PRICE_ID",
      "STRIPE_EXPECTED_AMOUNT",
      "STRIPE_EXPECTED_CURRENCY",
    ] as const;
    for (const field of required) {
      if (!environment[field])
        blockers.push(`Missing required setting: ${field}.`);
    }
  }

  return {
    scope: "configuration-only",
    stage,
    configuration: blockers.length ? "blocked" : "pass",
    environment: environment.APP_ENV,
    publicIndexing: environment.PUBLIC_INDEXING_ENABLED,
    livePayments: environment.STRIPE_MODE === "live",
    blockers,
    operationalEvidence: "not-verified",
  };
}
