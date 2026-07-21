export function safeApplicationPath(
  candidate: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    candidate.includes("\0")
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, "https://application.invalid");
    return parsed.origin === "https://application.invalid"
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}
