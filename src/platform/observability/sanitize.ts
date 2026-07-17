const SECRET_KEY_PATTERN = /(authorization|cookie|password|secret|token)/i;

function sanitizeValue(value: unknown): unknown {
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
