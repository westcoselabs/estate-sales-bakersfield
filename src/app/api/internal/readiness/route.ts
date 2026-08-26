import { randomUUID } from "node:crypto";

import { getServerEnvironment } from "@/platform/config/env";
import { getPrismaClient } from "@/platform/database/client";
import { logger } from "@/platform/observability/logger";
import { hasValidBearerSecret } from "@/platform/security/bearer-secret";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 10;

const headers = (requestId: string) => ({
  "cache-control": "private, no-store",
  "x-request-id": requestId,
  "x-robots-tag": "noindex, nofollow, noarchive",
});

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
      { status: 401, headers: headers(requestId) },
    );
  }

  try {
    const prisma = getPrismaClient();
    const [, deadJobs, failedResendWebhooks, manualReviewPayments] =
      await Promise.all([
        prisma.$queryRaw`SELECT 1`,
        prisma.durableJob.count({ where: { status: "DEAD" } }),
        prisma.resendWebhookEvent.count({
          where: { processingState: "FAILED" },
        }),
        prisma.paymentAttempt.count({
          where: { fulfillmentState: "MANUAL_REVIEW" },
        }),
      ]);
    return Response.json(
      {
        build: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "local",
        requestId,
        status:
          deadJobs + failedResendWebhooks + manualReviewPayments > 0
            ? "warning"
            : "ready",
        warnings: {
          deadJobs,
          failedResendWebhooks,
          manualReviewPayments,
        },
      },
      { headers: headers(requestId) },
    );
  } catch (error) {
    logger.error(
      {
        requestId,
        operation: "release.readiness",
        errorType: error instanceof Error ? error.name : "UnknownError",
      },
      "Protected readiness check failed",
    );
    return Response.json(
      { requestId, status: "unavailable" },
      { status: 503, headers: headers(requestId) },
    );
  }
}
