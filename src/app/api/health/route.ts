import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request): Response {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();

  return Response.json(
    {
      build: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "local",
      requestId,
      status: "ok",
    },
    {
      headers: {
        "cache-control": "no-store",
        "x-request-id": requestId,
      },
    },
  );
}
