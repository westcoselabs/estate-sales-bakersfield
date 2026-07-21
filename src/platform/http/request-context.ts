import { randomUUID } from "node:crypto";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,100}$/;

export function requestIdFrom(request: Request): string {
  const candidate = request.headers.get("x-request-id");
  return candidate && REQUEST_ID_PATTERN.test(candidate)
    ? candidate
    : randomUUID();
}

export function networkIdentifierFrom(request: Request): string {
  const candidate =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for")?.split(",")[0] ??
    "unknown";
  return candidate.trim().slice(0, 128) || "unknown";
}
