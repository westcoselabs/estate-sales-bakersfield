const SECRET_KEY_PATTERN =
  /(authorization|cookie|email|password|recipient|secret|token|signature|checkouturl|sessionurl|rawbody)/i;
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SENSITIVE_QUERY_VALUE_PATTERN =
  /([?&#](?:authorization|code|credential|password|secret|token)=)[^&#\s]*/gi;

function sanitizeString(value: string): string {
  if (OPAQUE_TOKEN_PATTERN.test(value)) return "[REDACTED]";
  return value.replace(SENSITIVE_QUERY_VALUE_PATTERN, "$1[REDACTED]");
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return sanitizeString(value);

  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : sanitizeValue(child),
      ]),
    );
  }

  return value;
}

export function sanitizeSentryEvent<T>(event: T): T {
  const sanitized = sanitizeValue(event) as T;

  if (sanitized && typeof sanitized === "object" && "user" in sanitized) {
    const user = (sanitized as { user?: Record<string, unknown> }).user;
    if (user) {
      delete user.email;
      delete user.ip_address;
    }
  }

  return sanitized;
}
