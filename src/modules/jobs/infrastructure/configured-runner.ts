import "server-only";

import { randomUUID } from "node:crypto";

import { cleanupConfiguredAuthenticationRateLimits } from "@/modules/auth";
import { createConfiguredEventService } from "@/modules/events";
import { createConfiguredPaymentService } from "@/modules/payments";
import { getPrismaClient } from "@/platform/database/client";

import { runJobBatch } from "../application/runner";
import { PrismaDurableJobRepository } from "./prisma-job-repository";

export async function runConfiguredJobBatch(limit = 10) {
  const rateLimitBucketsDeleted =
    await cleanupConfiguredAuthenticationRateLimits();
  const paymentService = createConfiguredPaymentService();
  const eventService = createConfiguredEventService();
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
      EVENT_MEDIA_PURGE: async (payload) => {
        if (
          !payload ||
          typeof payload !== "object" ||
          !("eventId" in payload) ||
          typeof payload.eventId !== "string"
        ) {
          throw new Error("INVALID_EVENT_MEDIA_PURGE_PAYLOAD");
        }
        await eventService.purgeLifecycleMedia(payload.eventId);
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
