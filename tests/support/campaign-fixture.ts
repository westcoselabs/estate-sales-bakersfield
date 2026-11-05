import { randomBytes, randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";

/** A paid publication inside the guarded test schema; no payment provider calls. */
export async function createCampaignListing(
  prisma: PrismaClient,
  userId: string,
) {
  const organizer = await prisma.organizerProfile.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  const publicId = randomBytes(6).toString("hex");
  const digest = randomBytes(32).toString("hex");
  const now = new Date();
  const event = await prisma.event.create({
    data: {
      organizerId: organizer.id,
      publicId,
      slug: "campaign-fixture",
      title: "Campaign fixture estate sale",
      eventType: "ESTATE_SALE",
      workflowState: "PREVIEW_READY",
      startsAt: new Date("2095-01-01T16:00:00Z"),
      endsAt: new Date("2095-01-03T21:00:00Z"),
      timezone: "America/Los_Angeles",
    },
  });
  const approval = await prisma.eventApproval.create({
    data: {
      eventId: event.id,
      organizerId: organizer.id,
      acceptedByUserId: userId,
      contentRevision: 1,
      approvalDigest: digest,
      termsVersion: "campaign-fixture-v1",
      termsAcceptedAt: now,
      approvedAt: now,
    },
  });
  await prisma.event.update({
    where: { id: event.id },
    data: {
      workflowState: "APPROVED_FOR_PAYMENT",
      approvalStatus: "APPROVED",
      approvedRevision: 1,
      approvalDigest: digest,
      approvedAt: now,
      termsVersion: approval.termsVersion,
      termsAcceptedAt: now,
      termsAcceptedByUserId: userId,
      currentApprovalId: approval.id,
    },
  });
  const payment = await prisma.paymentAttempt.create({
    data: {
      eventId: event.id,
      organizerId: organizer.id,
      userId,
      approvalId: approval.id,
      approvedRevision: 1,
      approvedDigest: digest,
      attemptGeneration: 1,
      environment: "test",
      stripeCheckoutSessionId: `cs_test_campaign_${randomUUID()}`,
      stripePriceId: "price_test_campaign",
      expectedAmount: 100,
      expectedCurrency: "usd",
      checkoutState: "COMPLETE",
      paymentState: "PAID",
      fulfillmentState: "FULFILLED",
      expiresAt: new Date(now.getTime() + 3_600_000),
      paidAt: now,
      fulfilledAt: now,
    },
  });
  await prisma.eventPublication.create({
    data: {
      eventId: event.id,
      paymentAttemptId: payment.id,
      approvedRevision: 1,
      approvalDigest: digest,
      publicId,
      canonicalPath: `/estate-sales/campaign-fixture-${publicId}`,
      snapshot: {
        schema: "campaign-test-fixture",
        privacyMode: "APPROXIMATE_LOCATION",
        projection: {
          eventType: "ESTATE_SALE",
          startsAt: "2095-01-01T16:00:00Z",
          endsAt: "2095-01-03T21:00:00Z",
          address: { city: "Bakersfield", region: "CA" },
        },
      },
      publishedAt: now,
    },
  });
  return event;
}
