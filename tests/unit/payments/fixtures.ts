import type { AuthPrincipal } from "@/modules/auth";
import { approvalDigest } from "@/modules/events/application/approval";
import { futurePublicEventProjection } from "@/modules/events/application/policy";
import type { EventRecord } from "@/modules/events/domain/types";
import type {
  HostedCheckoutSession,
  PaymentAttemptRecord,
  PublicationPrice,
} from "@/modules/payments/domain/types";

import { readyEvent } from "../events/fixtures";

export const now = new Date("2026-07-21T19:00:00.000Z");

export const principal: AuthPrincipal = {
  id: "11111111-1111-4111-8111-111111111111",
  displayName: "Payment Owner",
  email: "payment-owner@example.test",
  emailVerifiedAt: now,
  role: "USER",
  status: "ACTIVE",
};

export const price: PublicationPrice = {
  priceId: "price_test_phase4_fixture",
  amount: 1234,
  currency: "usd",
  fixture: true,
};

export function approvedEvent(changes: Partial<EventRecord> = {}): EventRecord {
  const event = readyEvent({
    id: "22222222-2222-4222-8222-222222222222",
    organizerId: "33333333-3333-4333-8333-333333333333",
    ownerUserId: principal.id,
    startsAt: new Date("2026-08-25T16:00:00.000Z"),
    endsAt: new Date("2026-08-25T22:00:00.000Z"),
    localStartsAt: "2026-08-25T09:00",
    localEndsAt: "2026-08-25T15:00",
    workflowState: "APPROVED_FOR_PAYMENT",
    approvalStatus: "APPROVED",
    approvedRevision: 6,
    approvedAt: now,
    termsVersion: "phase3-owner-publication-v1",
    termsAcceptedAt: now,
    currentApprovalId: "44444444-4444-4444-8444-444444444444",
    ...changes,
  });
  return {
    ...event,
    approvalDigest: approvalDigest(event, futurePublicEventProjection(event)),
    ...(changes.approvalDigest !== undefined
      ? { approvalDigest: changes.approvalDigest }
      : {}),
  };
}

export function paymentAttempt(
  event = approvedEvent(),
  changes: Partial<PaymentAttemptRecord> = {},
): PaymentAttemptRecord {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    eventId: event.id,
    organizerId: event.organizerId,
    userId: event.ownerUserId,
    approvalId: event.currentApprovalId!,
    approvedRevision: event.approvedRevision!,
    approvedDigest: event.approvalDigest!,
    attemptGeneration: 1,
    environment: "test",
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    stripePriceId: price.priceId,
    expectedAmount: price.amount,
    expectedCurrency: price.currency,
    checkoutState: "CREATING",
    paymentState: "UNPAID",
    fulfillmentState: "NOT_STARTED",
    expiresAt: null,
    paidAt: null,
    fulfilledAt: null,
    lastReconciledAt: null,
    failureReason: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...changes,
  };
}

export function paidSession(
  attempt: PaymentAttemptRecord,
  changes: Partial<HostedCheckoutSession> = {},
): HostedCheckoutSession {
  const id =
    attempt.stripeCheckoutSessionId ??
    "cs_test_55555555555545558555555555555555";
  return {
    id,
    url: null,
    status: "COMPLETE",
    paymentStatus: "PAID",
    paymentIntentId: "pi_test_phase4",
    amountTotal: attempt.expectedAmount,
    currency: attempt.expectedCurrency,
    expiresAt: new Date("2026-08-21T19:00:00.000Z"),
    metadata: {
      paymentAttemptId: attempt.id,
      eventId: attempt.eventId,
      approvedRevision: String(attempt.approvedRevision),
      approvalDigest: attempt.approvedDigest,
      applicationEnvironment: attempt.environment,
    },
    lineItems: [
      {
        priceId: attempt.stripePriceId,
        amount: attempt.expectedAmount,
        currency: attempt.expectedCurrency,
        quantity: 1,
      },
    ],
    ...changes,
  };
}
