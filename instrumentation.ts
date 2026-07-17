import * as Sentry from "@sentry/nextjs";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./src/platform/observability/sentry.server");
  }
}

export const onRequestError = Sentry.captureRequestError;
