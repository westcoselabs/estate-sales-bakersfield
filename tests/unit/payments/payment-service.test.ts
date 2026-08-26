import { describe, expect, it, vi } from "vitest";

import type { EventRepository } from "@/modules/events/application/ports";
import { EventLifecycleBlockedError } from "@/modules/events/domain/errors";
import { PaymentService } from "@/modules/payments/application/payment-service";
import type {
  PaymentRepository,
  StripeProvider,
} from "@/modules/payments/application/ports";
import { StripeProviderError } from "@/modules/payments/domain/errors";
import type {
  PaymentAttemptRecord,
  PublicationRecord,
} from "@/modules/payments/domain/types";

import {
  approvedEvent,
  now,
  paidSession,
  paymentAttempt,
  price,
  principal,
} from "./fixtures";

function paymentRepository(
  overrides: Partial<PaymentRepository> = {},
): PaymentRepository {
  return {
    findActiveAttempt: vi.fn(async () => null),
    createAttempt: vi.fn(),
    attachCheckout: vi.fn(),
    markCheckoutCreationFailed: vi.fn(async () => undefined),
    markAttemptExpired: vi.fn(async () => undefined),
    markAttemptCanceled: vi.fn(async () => undefined),
    findAttemptById: vi.fn(async () => null),
    findAttemptBySessionId: vi.fn(async () => null),
    attachRecoveredCheckout: vi.fn(async () => null),
    findLatestOwnedAttempt: vi.fn(async () => null),
    findPublicationForEvent: vi.fn(async () => null),
    beginWebhook: vi.fn(async () => "PROCESS" as const),
    completeWebhook: vi.fn(async () => undefined),
    failWebhook: vi.fn(async () => undefined),
    recordPendingSession: vi.fn(async () => undefined),
    recordFailedSession: vi.fn(async () => undefined),
    recordPaidBlocked: vi.fn(async ({ attempt }) => ({
      disposition: "BLOCKED" as const,
      attemptId: attempt.id,
      canonicalPath: null,
    })),
    publish: vi.fn(),
    markReconciliationRetrying: vi.fn(async () => undefined),
    findReconciliationCandidates: vi.fn(async () => []),
    enqueueReconciliation: vi.fn(async () => undefined),
    findPublishedByPublicId: vi.fn(async () => null),
    ...overrides,
  };
}

function eventRepository(event = approvedEvent()): EventRepository {
  return {
    findOwned: vi.fn(async () => event),
    findOwnedForLifecycle: vi.fn(async () => event),
  } as unknown as EventRepository;
}

function stripeProvider(
  overrides: Partial<StripeProvider> = {},
): StripeProvider {
  return {
    retrievePrice: vi.fn(async () => ({
      priceId: price.priceId,
      active: true,
      amount: price.amount,
      currency: price.currency,
      billingType: "one_time" as const,
    })),
    createHostedCheckout: vi.fn(),
    retrieveCheckout: vi.fn(),
    expireCheckout: vi.fn(),
    verifyWebhook: vi.fn(),
    ...overrides,
  };
}

function service(
  payments: PaymentRepository,
  events: EventRepository,
  stripe: StripeProvider,
) {
  return new PaymentService(
    payments,
    events,
    stripe,
    price,
    "test",
    new URL("http://127.0.0.1:3417"),
    { revalidate: vi.fn() },
    () => now,
  );
}

function publication(attempt: PaymentAttemptRecord): PublicationRecord {
  const event = approvedEvent();
  return {
    id: "66666666-6666-4666-8666-666666666666",
    eventId: event.id,
    paymentAttemptId: attempt.id,
    approvedRevision: attempt.approvedRevision,
    approvalDigest: attempt.approvedDigest,
    publicId: event.publicId,
    canonicalPath: `/estate-sales/${event.slug}-${event.publicId}`,
    snapshot: {
      schema: "estate-sales-publication-v1",
      privacyMode: "EXACT_ADDRESS",
      projection: {
        title: event.title!,
        description: event.description!,
        eventType: event.eventType,
        path: `/estate-sales/${event.slug}-${event.publicId}`,
        startsAt: event.startsAt!.toISOString(),
        endsAt: event.endsAt!.toISOString(),
        timezone: event.timezone!,
        localStartsAt: event.localStartsAt!,
        localEndsAt: event.localEndsAt!,
        address: {
          kind: "EXACT",
          addressLine1: "123 Main Street",
          addressLine2: null,
          city: "Bakersfield",
          region: "CA",
          postalCode: "93301",
          countryCode: "US",
        },
        organizer: {
          displayName: event.organizerDisplayName,
          websiteUrl: event.organizerWebsiteUrl,
          contactEmail: event.ownerVerifiedEmail,
        },
        coverPhotoUrl: `/media/${event.coverPhotoId}/cover`,
        gallery: [
          {
            id: event.coverPhotoId!,
            url: `/media/${event.coverPhotoId}/gallery`,
            position: 0,
          },
        ],
      },
    },
    publishedAt: now,
  };
}

describe("Phase 4 payment service", () => {
  it("expires an open unpaid Checkout before allowing draft deletion", async () => {
    const event = approvedEvent();
    const attempt = paymentAttempt(event, {
      stripeCheckoutSessionId: "cs_test_delete_open",
      checkoutState: "OPEN",
      expiresAt: new Date(now.getTime() + 30 * 60_000),
      version: 2,
    });
    const markAttemptCanceled = vi.fn(async () => undefined);
    const expireCheckout = vi.fn(async () =>
      paidSession(attempt, {
        id: "cs_test_delete_open",
        status: "EXPIRED",
        paymentStatus: "UNPAID",
        paymentIntentId: null,
      }),
    );
    const payments = paymentRepository({
      findLatestOwnedAttempt: vi.fn(async () => attempt),
      markAttemptCanceled,
    });
    const provider = stripeProvider({
      retrieveCheckout: vi.fn(async () =>
        paidSession(attempt, {
          id: "cs_test_delete_open",
          status: "OPEN",
          paymentStatus: "UNPAID",
          paymentIntentId: null,
        }),
      ),
      expireCheckout,
    });

    await expect(
      service(payments, eventRepository(event), provider).prepareDraftDeletion(
        principal,
        event.id,
        { requestId: "delete-open-checkout" },
      ),
    ).resolves.toBeUndefined();
    expect(expireCheckout).toHaveBeenCalledWith("cs_test_delete_open");
    expect(markAttemptCanceled).toHaveBeenCalledWith({
      attemptId: attempt.id,
      userId: principal.id,
      audit: { requestId: "delete-open-checkout" },
    });
  });

  it("blocks draft deletion as soon as payment may have been received", async () => {
    const event = approvedEvent();
    const provider = stripeProvider();
    const payments = paymentRepository({
      findLatestOwnedAttempt: vi.fn(async () =>
        paymentAttempt(event, {
          stripeCheckoutSessionId: "cs_test_delete_paid",
          checkoutState: "COMPLETE",
          paymentState: "PAID",
          fulfillmentState: "PROCESSING",
        }),
      ),
    });

    await expect(
      service(payments, eventRepository(event), provider).prepareDraftDeletion(
        principal,
        event.id,
      ),
    ).rejects.toBeInstanceOf(EventLifecycleBlockedError);
    expect(provider.retrieveCheckout).not.toHaveBeenCalled();
    expect(provider.expireCheckout).not.toHaveBeenCalled();
  });

  it("reports an owner-canceled publication as history without changing payment", async () => {
    const approved = approvedEvent();
    const approvedAttempt = paymentAttempt(approved);
    const event = {
      ...approved,
      canceledAt: now,
      publication: publication(approvedAttempt),
    };
    const attempt = paymentAttempt(event, {
      checkoutState: "COMPLETE",
      paymentState: "PAID",
      fulfillmentState: "FULFILLED",
    });
    const payments = paymentRepository({
      findLatestOwnedAttempt: vi.fn(async () => attempt),
      findPublicationForEvent: vi.fn(async () => publication(attempt)),
    });

    await expect(
      service(payments, eventRepository(event), stripeProvider()).status(
        principal,
        event.id,
      ),
    ).resolves.toMatchObject({
      displayState: "CANCELED",
      paymentState: "PAID",
      fulfillmentState: "FULFILLED",
    });
  });

  it("creates hosted Checkout from server price, safe correlation metadata, and server URLs", async () => {
    const event = approvedEvent();
    const attempt = paymentAttempt(event);
    const attached = paymentAttempt(event, {
      stripeCheckoutSessionId: "cs_test_created",
      checkoutState: "OPEN",
      expiresAt: new Date(now.getTime() + 31 * 60_000),
      version: 2,
    });
    const createHostedCheckout = vi.fn(async (input) => ({
      ...paidSession(attached, {
        id: "cs_test_created",
        url: "http://127.0.0.1:3417/test-checkout/cs_test_created",
        status: "OPEN",
        paymentStatus: "UNPAID",
        paymentIntentId: null,
        expiresAt: input.expiresAt,
      }),
    }));
    const payments = paymentRepository({
      createAttempt: vi.fn(async () => attempt),
      attachCheckout: vi.fn(async () => attached),
    });

    await expect(
      service(
        payments,
        eventRepository(event),
        stripeProvider({ createHostedCheckout }),
      ).createCheckout(principal, event.id, event.version),
    ).resolves.toMatchObject({
      attemptId: attempt.id,
      checkoutUrl: expect.stringContaining("/test-checkout/"),
    });

    expect(createHostedCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        price,
        metadata: {
          paymentAttemptId: attempt.id,
          eventId: event.id,
          approvedRevision: String(event.approvedRevision),
          approvalDigest: event.approvalDigest,
          applicationEnvironment: "test",
        },
        successUrl: expect.stringContaining(
          `/dashboard/events/${event.id}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        ),
        cancelUrl: expect.stringContaining(
          `/dashboard/events/${event.id}/payment/cancel?attempt=${attempt.id}`,
        ),
        idempotencyKey: `phase4:test:${attempt.id}:g1`,
      }),
    );
  });

  it("rejects a mismatched provider Price before creating an attempt", async () => {
    const event = approvedEvent();
    const createAttempt = vi.fn();
    const createHostedCheckout = vi.fn();
    const provider = stripeProvider({
      retrievePrice: vi.fn(async () => ({
        priceId: price.priceId,
        active: true,
        amount: price.amount + 1,
        currency: price.currency,
        billingType: "one_time" as const,
      })),
      createHostedCheckout,
    });

    await expect(
      service(
        paymentRepository({ createAttempt }),
        eventRepository(event),
        provider,
      ).createCheckout(principal, event.id, event.version),
    ).rejects.toMatchObject({ code: "PAYMENT_CONFIGURATION_UNAVAILABLE" });
    expect(createAttempt).not.toHaveBeenCalled();
    expect(createHostedCheckout).not.toHaveBeenCalled();
  });

  it("replaces a local fixture Checkout lost after a server restart", async () => {
    const event = approvedEvent();
    const staleAttempt = paymentAttempt(event, {
      stripeCheckoutSessionId: "cs_test_lost_after_restart",
      checkoutState: "OPEN",
      expiresAt: new Date(now.getTime() + 20 * 60_000),
      version: 2,
    });
    const freshAttempt = paymentAttempt(event, {
      id: "77777777-7777-4777-8777-777777777777",
      attemptGeneration: 2,
    });
    const attached = paymentAttempt(event, {
      ...freshAttempt,
      stripeCheckoutSessionId: "cs_test_fresh_after_restart",
      checkoutState: "OPEN",
      expiresAt: new Date(now.getTime() + 31 * 60_000),
      version: 2,
    });
    const markAttemptExpired = vi.fn(async () => undefined);
    const payments = paymentRepository({
      findActiveAttempt: vi.fn(async () => staleAttempt),
      markAttemptExpired,
      createAttempt: vi.fn(async () => freshAttempt),
      attachCheckout: vi.fn(async () => attached),
    });
    const provider = stripeProvider({
      retrieveCheckout: vi.fn(async () => {
        throw new StripeProviderError("SESSION_NOT_FOUND");
      }),
      createHostedCheckout: vi.fn(async (input) => ({
        ...paidSession(attached, {
          id: "cs_test_fresh_after_restart",
          url: "http://127.0.0.1:3417/test-checkout/cs_test_fresh_after_restart",
          status: "OPEN",
          paymentStatus: "UNPAID",
          paymentIntentId: null,
          expiresAt: input.expiresAt,
        }),
      })),
    });

    await expect(
      service(payments, eventRepository(event), provider).createCheckout(
        principal,
        event.id,
        event.version,
      ),
    ).resolves.toMatchObject({
      attemptId: freshAttempt.id,
      checkoutUrl: expect.stringContaining("fresh_after_restart"),
    });
    expect(markAttemptExpired).toHaveBeenCalledWith({
      attemptId: staleAttempt.id,
      expectedVersion: staleAttempt.version,
      reconciledAt: now,
      audit: {},
    });
  });

  it("records paid mismatch evidence but never publishes", async () => {
    const event = approvedEvent();
    const attempt = paymentAttempt(event, {
      stripeCheckoutSessionId: "cs_test_paid_mismatch",
      checkoutState: "COMPLETE",
    });
    const session = paidSession(attempt, { amountTotal: 9999 });
    const recordPaidBlocked = vi.fn(async () => ({
      disposition: "BLOCKED" as const,
      attemptId: attempt.id,
      canonicalPath: null,
    }));
    const publish = vi.fn();
    const payments = paymentRepository({
      findAttemptBySessionId: vi.fn(async () => attempt),
      recordPaidBlocked,
      publish,
    });

    await expect(
      service(
        payments,
        eventRepository(event),
        stripeProvider(),
      ).fulfillSession(session),
    ).resolves.toMatchObject({ disposition: "BLOCKED" });
    expect(recordPaidBlocked).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "CHECKOUT_AMOUNT_OR_CURRENCY_MISMATCH",
      }),
    );
    expect(publish).not.toHaveBeenCalled();
  });

  it("makes repeated fulfillment an idempotent no-op", async () => {
    const attempt = paymentAttempt(approvedEvent(), {
      stripeCheckoutSessionId: "cs_test_already_published",
      paymentState: "PAID",
      fulfillmentState: "FULFILLED",
    });
    const publish = vi.fn();
    const payments = paymentRepository({
      findAttemptBySessionId: vi.fn(async () => attempt),
      findPublicationForEvent: vi.fn(async () => publication(attempt)),
      publish,
    });
    await expect(
      service(payments, eventRepository(), stripeProvider()).fulfillSession(
        paidSession(attempt),
      ),
    ).resolves.toMatchObject({
      disposition: "ALREADY_FULFILLED",
      canonicalPath: expect.stringContaining("/estate-sales/"),
    });
    expect(publish).not.toHaveBeenCalled();
  });

  it("marks provider failures for reconciliation without exposing provider details", async () => {
    const attempt = paymentAttempt(approvedEvent(), {
      stripeCheckoutSessionId: "cs_test_reconcile",
      checkoutState: "COMPLETE",
    });
    const markReconciliationRetrying = vi.fn(async () => undefined);
    const payments = paymentRepository({
      findAttemptById: vi.fn(async () => attempt),
      markReconciliationRetrying,
    });
    const provider = stripeProvider({
      retrieveCheckout: vi.fn(async () => {
        throw new StripeProviderError("PROVIDER_CONNECTION_ERROR", {
          cause: new Error("secret provider response"),
        });
      }),
    });
    await expect(
      service(payments, eventRepository(), provider).reconcileAttempt(
        attempt.id,
      ),
    ).rejects.toMatchObject({
      code: "FULFILLMENT_RETRYING",
      message: "Payment fulfillment is waiting for a safe retry.",
    });
    expect(markReconciliationRetrying).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "PROVIDER_CONNECTION_ERROR" }),
    );
  });

  it("expires an open provider Session before recording a cancel return", async () => {
    const event = approvedEvent();
    const attempt = paymentAttempt(event, {
      stripeCheckoutSessionId: "cs_test_cancel",
      checkoutState: "OPEN",
    });
    const session = paidSession(attempt, {
      id: "cs_test_cancel",
      url: "https://checkout.example.test/cancel",
      status: "OPEN",
      paymentStatus: "UNPAID",
      paymentIntentId: null,
    });
    const markAttemptCanceled = vi.fn(async () => undefined);
    const payments = paymentRepository({
      findAttemptById: vi.fn(async () => attempt),
      markAttemptCanceled,
    });
    const expireCheckout = vi.fn(async () => ({
      ...session,
      status: "EXPIRED" as const,
      url: null,
    }));
    await service(
      payments,
      eventRepository(event),
      stripeProvider({
        retrieveCheckout: vi.fn(async () => session),
        expireCheckout,
      }),
    ).cancelReturn(principal, event.id, attempt.id);
    expect(expireCheckout).toHaveBeenCalledWith(session.id);
    expect(markAttemptCanceled).toHaveBeenCalledWith({
      attemptId: attempt.id,
      userId: principal.id,
      audit: {},
    });
  });

  it.each([
    ["BLOCKED", "PAID_PUBLICATION_BLOCKED"],
    ["RETRYING", "FULFILLMENT_RETRYING"],
    ["MANUAL_REVIEW", "MANUAL_REVIEW_REQUIRED"],
  ] as const)(
    "maps %s fulfillment into the dashboard state %s",
    async (fulfillmentState, displayState) => {
      const event = approvedEvent();
      const attempt = paymentAttempt(event, { fulfillmentState });
      const payments = paymentRepository({
        findLatestOwnedAttempt: vi.fn(async () => attempt),
      });
      await expect(
        service(payments, eventRepository(event), stripeProvider()).status(
          principal,
          event.id,
        ),
      ).resolves.toMatchObject({
        displayState,
        recoverable: fulfillmentState !== "MANUAL_REVIEW",
      });
    },
  );
});
