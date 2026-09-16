const PUBLIC_PATHS = new Set([
  "/",
  "/estate-sales",
  "/yard-sales",
  "/estate-sales/this-weekend",
  "/yard-sales/this-weekend",
  "/sales-today",
  "/search",
  "/about",
  "/how-it-works",
  "/list-your-sale",
  "/faq",
  "/contact",
  "/privacy",
  "/terms",
]);

/** Allow only public routes; discard search terms, tokens, hashes and private IDs. */
export function analyticsPagePath(value: string): string | null {
  const path = value.split(/[?#]/u)[0] ?? "";
  return PUBLIC_PATHS.has(path) ||
    /^\/(estate-sales|yard-sales)\/[a-z0-9-]+-[0-9a-f]{12}$/u.test(path)
    ? path
    : null;
}

export function validMeasurementId(value: string): boolean {
  return /^G-[A-Z0-9]+$/u.test(value);
}
