import "server-only";

import { randomUUID } from "node:crypto";

import { cleanupConfiguredAuthenticationRateLimits } from "@/modules/auth";
import { createConfiguredEventService } from "@/modules/events";
import { PrismaDurableJobRepository, runJobBatch } from "@/modules/jobs";
import {
  createConfiguredExternalListingLifecycleService,
  EXTERNAL_LISTING_EXPIRATION_JOB_TYPE,
} from "@/modules/listing-imports";
import { createConfiguredPaymentService } from "@/modules/payments";
import { getPrismaClient } from "@/platform/database/client";

export async function runConfiguredJobBatch(limit = 10) {
  const rateLimitBucketsDeleted =
    await cleanupConfiguredAuthenticationRateLimits();
  const paymentService = createConfiguredPaymentService();
  const eventService = createConfiguredEventService();
  const externalListingLifecycle =
    createConfiguredExternalListingLifecycleService();
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
      EVENT_PHOTO_RESERVATION_PURGE: async (payload) => {
        if (
          !payload ||
          typeof payload !== "object" ||
          !("reservationId" in payload) ||
          typeof payload.reservationId !== "string"
        ) {
          throw new Error("INVALID_PHOTO_RESERVATION_PURGE_PAYLOAD");
        }
        await eventService.purgeExpiredPhotoReservation(payload.reservationId);
      },
      EVENT_PHOTO_PURGE: async (payload) => {
        if (
          !payload ||
          typeof payload !== "object" ||
          !("photoId" in payload) ||
          typeof payload.photoId !== "string"
        ) {
          throw new Error("INVALID_PHOTO_PURGE_PAYLOAD");
        }
        await eventService.purgeDeletedPhoto(payload.photoId);
      },
      [EXTERNAL_LISTING_EXPIRATION_JOB_TYPE]: async (payload, context) => {
        await externalListingLifecycle.expire(payload, {
          jobId: context.jobId,
        });
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
