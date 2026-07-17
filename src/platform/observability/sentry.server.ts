import * as Sentry from "@sentry/nextjs";

import { sanitizeSentryEvent } from "./sanitize";

const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.APP_ENV ?? process.env.NODE_ENV,
  sendDefaultPii: false,
  beforeSend: sanitizeSentryEvent,
});
