import { randomUUID } from "node:crypto";

import { runConfiguredJobBatch } from "@/modules/jobs";
import { getServerEnvironment } from "@/platform/config/env";
import { logger } from "@/platform/observability/logger";
import { hasValidBearerSecret } from "@/platform/security/bearer-secret";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request): Promise<Response> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const environment = getServerEnvironment();
  if (
    !environment.CRON_SECRET ||
    !hasValidBearerSecret(
      request.headers.get("authorization"),
      environment.CRON_SECRET,
    )
  ) {
    return Response.json(
      { requestId, error: "Unauthorized" },
      {
        status: 401,
        headers: { "cache-control": "no-store", "x-request-id": requestId },
      },
    );
  }

  try {
    const result = await runConfiguredJobBatch(10);
    return Response.json(
      { requestId, ...result },
      { headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
  } catch (error) {
    logger.error(
      {
        requestId,
        errorType: error instanceof Error ? error.name : "UnknownError",
      },
      "Scheduled maintenance batch failed",
    );
    return Response.json(
      { requestId, error: "Scheduled maintenance is temporarily unavailable" },
      {
        status: 503,
        headers: { "cache-control": "no-store", "x-request-id": requestId },
      },
    );
  }
}
