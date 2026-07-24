import pino, { type Bindings, type DestinationStream, type Logger } from "pino";

export const REDACTED_LOG_PATHS = [
  "authorization",
  "cookie",
  "set-cookie",
  "headers.authorization",
  "headers.cookie",
  "headers.set-cookie",
  "email",
  "normalizedEmail",
  "recipient",
  "to",
  "password",
  "passwordHash",
  "sessionToken",
  "verificationToken",
  "resetToken",
  "token",
  "stripeSignature",
  "stripeSecretKey",
  "webhookSecret",
  "checkoutUrl",
  "sessionUrl",
  "rawBody",
  "apiKey",
  "geoapifyApiKey",
  "addressQuery",
  "addressLine1",
  "addressLine2",
  "coordinates",
  "latitude",
  "longitude",
  "*.password",
  "*.email",
  "*.normalizedEmail",
  "*.recipient",
  "*.to",
  "*.passwordHash",
  "*.sessionToken",
  "*.verificationToken",
  "*.resetToken",
  "*.token",
  "*.stripeSignature",
  "*.stripeSecretKey",
  "*.webhookSecret",
  "*.checkoutUrl",
  "*.sessionUrl",
  "*.rawBody",
  "*.apiKey",
  "*.geoapifyApiKey",
  "*.addressQuery",
  "*.addressLine1",
  "*.addressLine2",
  "*.coordinates",
  "*.latitude",
  "*.longitude",
];

export function createLogger(
  bindings: Bindings = {},
  destination?: DestinationStream,
): Logger {
  const logger = pino(
    {
      base: null,
      level:
        process.env.LOG_LEVEL ??
        (process.env.NODE_ENV === "test" ? "silent" : "info"),
      redact: { paths: REDACTED_LOG_PATHS, censor: "[REDACTED]" },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    destination,
  );

  return logger.child(bindings);
}

export const logger = createLogger({ service: "estate-sales-directory" });
