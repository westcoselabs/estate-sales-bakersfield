import { randomUUID } from "node:crypto";
import { runConfiguredEmailJobBatch } from "@/modules/email";
import { getServerEnvironment } from "@/platform/config/env";
import { hasValidBearerSecret } from "@/platform/security/bearer-secret";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const secret = getServerEnvironment().CRON_SECRET;
  if (
    !secret ||
    !hasValidBearerSecret(request.headers.get("authorization"), secret)
  )
    return Response.json(
      { requestId, error: "Unauthorized" },
      {
        status: 401,
        headers: { "cache-control": "no-store", "x-request-id": requestId },
      },
    );
  try {
    return Response.json(
      { requestId, ...(await runConfiguredEmailJobBatch(10)) },
      { headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
  } catch {
    return Response.json(
      { requestId, error: "Email maintenance is temporarily unavailable" },
      {
        status: 503,
        headers: { "cache-control": "no-store", "x-request-id": requestId },
      },
    );
  }
}
