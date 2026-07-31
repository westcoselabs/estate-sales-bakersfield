import "server-only";
import { randomUUID } from "node:crypto";
import { runJobBatch, PrismaDurableJobRepository } from "@/modules/jobs";
import { getPrismaClient } from "@/platform/database/client";
import { getServerEnvironment } from "@/platform/config/env";
import { createConfiguredEmailGateway } from "./configured-email";
import { EmailJobProcessor } from "./email-job-processor";

export function runConfiguredEmailJobBatch(limit = 10) {
  const processor = new EmailJobProcessor(
    getPrismaClient(),
    createConfiguredEmailGateway(),
    getServerEnvironment(),
  );
  return runJobBatch(
    new PrismaDurableJobRepository(getPrismaClient()),
    {
      EMAIL_RECEIPT_SEND: async (payload) => {
        if (
          !payload ||
          typeof payload !== "object" ||
          !("deliveryId" in payload) ||
          typeof payload.deliveryId !== "string"
        )
          throw new Error("INVALID_RECEIPT_JOB_PAYLOAD");
        await processor.sendReceipt(payload.deliveryId);
      },
      EMAIL_CAMPAIGN_SEND: async (payload) => {
        if (
          !payload ||
          typeof payload !== "object" ||
          !("campaignId" in payload) ||
          typeof payload.campaignId !== "string"
        )
          throw new Error("INVALID_CAMPAIGN_JOB_PAYLOAD");
        await processor.sendCampaign(payload.campaignId);
      },
      RESEND_CONTACT_SUBSCRIPTION: async (payload) => {
        if (
          !payload ||
          typeof payload !== "object" ||
          !("userId" in payload) ||
          typeof payload.userId !== "string" ||
          !("subscribed" in payload) ||
          typeof payload.subscribed !== "boolean"
        ) {
          throw new Error("INVALID_CONTACT_SUBSCRIPTION_JOB_PAYLOAD");
        }
        await processor.updateContactSubscription(
          payload.userId,
          payload.subscribed,
        );
      },
    },
    { queue: "email", workerId: `email-vercel-${randomUUID()}`, limit },
  );
}
