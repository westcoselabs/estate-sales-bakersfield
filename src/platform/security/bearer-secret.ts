import { timingSafeEqual } from "node:crypto";

export function hasValidBearerSecret(
  authorizationHeader: string | null,
  expectedSecret: string,
): boolean {
  if (!authorizationHeader?.startsWith("Bearer ")) return false;
  const actual = Buffer.from(
    authorizationHeader.slice("Bearer ".length),
    "utf8",
  );
  const expected = Buffer.from(expectedSecret, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
