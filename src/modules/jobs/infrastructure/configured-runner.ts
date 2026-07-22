import "server-only";

import { randomUUID } from "node:crypto";

import { cleanupConfiguredAuthenticationRateLimits } from "@/modules/auth";
import { createConfiguredPaymentService } from "@/modules/payments";
import { getPrismaClient } from "@/platform/database/client";

import { runJobBatch } from "../application/runner";
import { PrismaDurableJobRepository } from "./prisma-job-repository";

export async function runConfiguredJobBatch(limit = 10) {
  const rateLimitBucketsDeleted =
    await cleanupConfiguredAuthenticationRateLimits();
  const paymentService = createConfiguredPaymentService();
  const reconciliationCandidatesEnqueued =
    await paymentService.enqueueReconciliationCandidates(50);
  const jobs = await runJobBatch(
    new PrismaDurableJobRepository(getPrismaClient()),
    {
      PAYMENT_RECONCILE: async (payload) => {
        if (
          !payload ||
          typeof payload !== "object" ||
          !("attemptId" in payload) ||
          typeof payload.attemptId !== "string"
        ) {
          throw new Error("INVALID_PAYMENT_RECONCILIATION_PAYLOAD");
        }
        await paymentService.reconcileAttempt(payload.attemptId);
      },
    },
    {
      queue: "default",
      workerId: `vercel-${randomUUID()}`,
      limit,
    },
  );
  return {
    ...jobs,
    rateLimitBucketsDeleted,
    reconciliationCandidatesEnqueued,
  };
}
