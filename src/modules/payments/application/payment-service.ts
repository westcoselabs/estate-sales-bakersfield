import type { AuthPrincipal } from "@/modules/auth";
import {
  requireUserPrincipal,
  requireVerifiedPublishingPrincipal,
} from "@/modules/auth";
import {
  EventConflictError,
  EventLifecycleBlockedError,
  EventNotFoundError,
  eventReadiness,
  type EventRecord,
  type EventRepository,
} from "@/modules/events";

import {
  ActiveCheckoutError,
  FulfillmentRetryingError,
  PaymentConfigurationError,
  PaymentError,
  StripeProviderError,
} from "../domain/errors";
import type {
  ApplicationEnvironment,
  CheckoutCorrelationMetadata,
  CheckoutRedirectDto,
  FulfillmentResult,
  HostedCheckoutSession,
  PaymentAttemptRecord,
  PaymentStatusDto,
  PublicationPrice,
  PublishedListing,
} from "../domain/types";
import { checkoutEligibility, fulfillmentEligibility } from "./eligibility";
import type {
  PaymentAuditContext,
  PaymentRepository,
  PublicationCache,
  StripeProvider,
} from "./ports";
import { createPublicationSnapshot, publishedListing } from "./publication";

const SUPPORTED_WEBHOOK_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
]);
const DATABASE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function correlationMetadata(
  attempt: PaymentAttemptRecord,
): CheckoutCorrelationMetadata {
  return {
    paymentAttemptId: attempt.id,
    eventId: attempt.eventId,
    approvedRevision: String(attempt.approvedRevision),
    approvalDigest: attempt.approvedDigest,
    applicationEnvironment: attempt.environment,
  };
}

function compatibleAttempt(
  attempt: PaymentAttemptRecord,
  eligibility: ReturnType<typeof checkoutEligibility>,
  price: PublicationPrice,
): boolean {
  return (
    attempt.approvalId === eligibility.approvalId &&
    attempt.approvedRevision === eligibility.approvedRevision &&
    attempt.approvedDigest === eligibility.approvalDigest &&
    attempt.stripePriceId === price.priceId &&
    attempt.expectedAmount === price.amount &&
    attempt.expectedCurrency === price.currency
  );
}

function sessionMismatch(
  attempt: PaymentAttemptRecord,
  session: HostedCheckoutSession,
): string | null {
  const metadata = correlationMetadata(attempt);
  if (
    attempt.stripeCheckoutSessionId !== session.id ||
    session.metadata.paymentAttemptId !== metadata.paymentAttemptId ||
    session.metadata.eventId !== metadata.eventId ||
    session.metadata.approvedRevision !== metadata.approvedRevision ||
    session.metadata.approvalDigest !== metadata.approvalDigest ||
    session.metadata.applicationEnvironment !== metadata.applicationEnvironment
  ) {
    return "CHECKOUT_CORRELATION_MISMATCH";
  }
  if (
    session.amountTotal !== attempt.expectedAmount ||
    session.currency !== attempt.expectedCurrency
  ) {
    return "CHECKOUT_AMOUNT_OR_CURRENCY_MISMATCH";
  }
  if (
    session.lineItems.length !== 1 ||
    session.lineItems[0]?.priceId !== attempt.stripePriceId ||
    session.lineItems[0]?.amount !== attempt.expectedAmount ||
    session.lineItems[0]?.currency !== attempt.expectedCurrency ||
    session.lineItems[0]?.quantity !== 1
  ) {
    return "CHECKOUT_LINE_ITEM_MISMATCH";
  }
  if (!session.paymentIntentId) return "PAYMENT_INTENT_MISSING";
  return null;
}

function statusMessage(state: PaymentStatusDto["displayState"]): string {
  return {
    DRAFT_INCOMPLETE:
      "Complete the listing details, schedule, location, photo, and cover.",
    READY_FOR_REVIEW:
      "Preview the exact listing and approve the current revision.",
    APPROVED: "The current listing revision is approved.",
    READY_FOR_PAYMENT: "This approved revision is ready for payment.",
    CHECKOUT_CREATED: "Checkout is ready. Payment has not been confirmed.",
    PAYMENT_PENDING: "Payment is pending authoritative Stripe confirmation.",
    PAYMENT_RECEIVED_PUBLISHING:
      "Payment was received and publication is processing.",
    PUBLISHED: "The approved listing revision is published.",
    CANCELED:
      "This paid listing was canceled by the organizer. Payment and publication records are retained; no refund was initiated.",
    PAYMENT_CANCELED: "Checkout was canceled before payment confirmation.",
    CHECKOUT_EXPIRED: "The Checkout Session expired without payment.",
    PAID_PUBLICATION_BLOCKED:
      "Payment was received, but the approved revision could not be published safely.",
    FULFILLMENT_RETRYING: "Payment reconciliation is retrying safely.",
    MANUAL_REVIEW_REQUIRED:
      "Payment requires manual review before publication.",
  }[state];
}

export class PaymentService {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly events: EventRepository,
    private readonly stripe: StripeProvider | null,
    private readonly price: PublicationPrice | null,
    private readonly environment: ApplicationEnvironment,
    private readonly applicationUrl: URL,
    private readonly cache: PublicationCache,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private configured(): {
    readonly stripe: StripeProvider;
    readonly price: PublicationPrice;
  } {
    if (!this.stripe || !this.price) throw new PaymentConfigurationError();
    return { stripe: this.stripe, price: this.price };
  }

  private async ownedEvent(
    principal: AuthPrincipal,
    eventId: string,
  ): Promise<EventRecord> {
    if (!DATABASE_ID.test(eventId)) throw new EventNotFoundError();
    const event = await this.events.findOwned(eventId, principal.id);
    if (!event) throw new EventNotFoundError();
    return event;
  }

  async createCheckout(
    principal: AuthPrincipal | null,
    eventId: string,
    expectedVersion: number,
    audit: PaymentAuditContext = {},
  ): Promise<CheckoutRedirectDto> {
    const user = requireVerifiedPublishingPrincipal(principal);
    const { stripe, price } = this.configured();
    const event = await this.ownedEvent(user, eventId);
    if (event.version !== expectedVersion) throw new EventConflictError();
    const eligible = checkoutEligibility(event, this.now());

    const active = await this.payments.findActiveAttempt(event.id);
    if (active) {
      if (!compatibleAttempt(active, eligible, price)) {
        await this.retireIncompatibleAttempt(active, stripe, audit);
      } else {
        const reusable = await this.reusableCheckout(active, stripe, audit);
        if (reusable) return reusable;
      }
    }

    const attempt = await this.payments.createAttempt({
      event,
      expectedEventVersion: event.version,
      userId: user.id,
      approvalId: eligible.approvalId,
      approvedRevision: eligible.approvedRevision,
      approvedDigest: eligible.approvalDigest,
      price,
      environment: this.environment,
      audit,
    });
    if (attempt.stripeCheckoutSessionId) {
      const reusable = await this.reusableCheckout(attempt, stripe, audit);
      if (reusable) return reusable;
    }
    if (attempt.checkoutState !== "CREATING") {
      throw new ActiveCheckoutError();
    }

    const expiresAt = new Date(this.now().getTime() + 31 * 60_000);
    const successUrl = `${new URL(
      `/dashboard/events/${event.id}/payment/success`,
      this.applicationUrl,
    ).toString()}?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${new URL(
      `/dashboard/events/${event.id}/payment/cancel`,
      this.applicationUrl,
    ).toString()}?attempt=${attempt.id}`;
    let session: HostedCheckoutSession;
    try {
      session = await stripe.createHostedCheckout({
        price,
        metadata: correlationMetadata(attempt),
        successUrl,
        cancelUrl,
        expiresAt,
        idempotencyKey: `phase4:${this.environment}:${attempt.id}:g${String(attempt.attemptGeneration)}`,
      });
    } catch (error) {
      await this.payments.markCheckoutCreationFailed({
        attemptId: attempt.id,
        expectedVersion: attempt.version,
        reason:
          error instanceof StripeProviderError
            ? error.providerCode
            : "CHECKOUT_PROVIDER_ERROR",
        audit,
      });
      throw error;
    }
    const attached = await this.payments.attachCheckout({
      attemptId: attempt.id,
      expectedVersion: attempt.version,
      session,
      reconciliationRunAt: new Date(this.now().getTime() + 2 * 60_000),
      audit,
    });
    if (!attached || !session.url) {
      await stripe.expireCheckout(session.id).catch(() => undefined);
      throw new ActiveCheckoutError(
        "Checkout changed concurrently. Reload before trying again.",
      );
    }
    return {
      attemptId: attached.id,
      checkoutUrl: session.url,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  private async retireIncompatibleAttempt(
    attempt: PaymentAttemptRecord,
    stripe: StripeProvider,
    audit: PaymentAuditContext,
  ): Promise<void> {
    if (attempt.checkoutState === "CREATING") {
      if (this.now().getTime() - attempt.createdAt.getTime() < 2 * 60_000) {
        throw new FulfillmentRetryingError(
          "Checkout creation is still being finalized.",
        );
      }
      await this.payments.markCheckoutCreationFailed({
        attemptId: attempt.id,
        expectedVersion: attempt.version,
        reason: "STALE_CHECKOUT_CREATION",
        audit,
      });
      return;
    }
    if (!attempt.stripeCheckoutSessionId) throw new ActiveCheckoutError();
    const session = await stripe.retrieveCheckout(
      attempt.stripeCheckoutSessionId,
    );
    if (session.paymentStatus === "PAID" || session.status === "COMPLETE") {
      await this.fulfillSession(session, audit);
      throw new ActiveCheckoutError(
        "A completed Checkout Session must finish reconciliation first.",
      );
    }
    if (session.status === "OPEN") {
      await stripe.expireCheckout(session.id);
    }
    await this.payments.markAttemptExpired({
      attemptId: attempt.id,
      expectedVersion: attempt.version,
      reconciledAt: this.now(),
      audit,
    });
  }

  private async reusableCheckout(
    attempt: PaymentAttemptRecord,
    stripe: StripeProvider,
    audit: PaymentAuditContext,
  ): Promise<CheckoutRedirectDto | null> {
    if (attempt.checkoutState === "CREATING") {
      if (this.now().getTime() - attempt.createdAt.getTime() < 2 * 60_000) {
        throw new FulfillmentRetryingError(
          "Checkout creation is still being finalized.",
        );
      }
      await this.payments.markCheckoutCreationFailed({
        attemptId: attempt.id,
        expectedVersion: attempt.version,
        reason: "STALE_CHECKOUT_CREATION",
        audit,
      });
      return null;
    }
    if (!attempt.stripeCheckoutSessionId) return null;
    let session: HostedCheckoutSession;
    try {
      session = await stripe.retrieveCheckout(attempt.stripeCheckoutSessionId);
    } catch (error) {
      // Local and test Checkout sessions live in process memory. A dev-server
      // restart can leave a database attempt pointing at a fixture session that
      // no longer exists. Retire only that deterministic attempt so this same
      // request can safely create a fresh test session.
      if (
        (this.environment === "local" || this.environment === "test") &&
        error instanceof StripeProviderError &&
        error.providerCode === "SESSION_NOT_FOUND"
      ) {
        await this.payments.markAttemptExpired({
          attemptId: attempt.id,
          expectedVersion: attempt.version,
          reconciledAt: this.now(),
          audit,
        });
        return null;
      }
      throw error;
    }
    if (
      session.status === "OPEN" &&
      session.paymentStatus === "UNPAID" &&
      session.url &&
      session.expiresAt > this.now()
    ) {
      return {
        attemptId: attempt.id,
        checkoutUrl: session.url,
        expiresAt: session.expiresAt.toISOString(),
      };
    }
    if (session.status === "EXPIRED" || session.expiresAt <= this.now()) {
      await this.payments.markAttemptExpired({
        attemptId: attempt.id,
        expectedVersion: attempt.version,
        reconciledAt: this.now(),
        audit,
      });
      return null;
    }
    await this.fulfillSession(session, audit);
    throw new PaymentError(
      "PAYMENT_PENDING",
      "Payment is being reconciled. Reload the payment status shortly.",
    );
  }

  async prepareDraftDeletion(
    principal: AuthPrincipal | null,
    eventId: string,
    audit: PaymentAuditContext = {},
  ): Promise<void> {
    const user = requireUserPrincipal(principal);
    if (!DATABASE_ID.test(eventId)) throw new EventNotFoundError();
    const event = await this.events.findOwnedForLifecycle(eventId, user.id);
    if (!event) throw new EventNotFoundError();
    if (event.deletedAt) return;
    if (event.publication || event.canceledAt) {
      throw new EventLifecycleBlockedError(
        "Published events must be canceled instead of deleted.",
      );
    }
    const attempt = await this.payments.findLatestOwnedAttempt(
      event.id,
      user.id,
    );
    if (!attempt) return;
    if (
      ["CANCELED", "EXPIRED", "FAILED"].includes(attempt.checkoutState) &&
      attempt.paymentState !== "PAID" &&
      attempt.fulfillmentState === "NOT_STARTED"
    ) {
      return;
    }
    if (
      attempt.checkoutState === "CREATING" ||
      attempt.paymentState === "PENDING" ||
      attempt.paymentState === "PAID" ||
      attempt.fulfillmentState !== "NOT_STARTED"
    ) {
      throw new EventLifecycleBlockedError(
        "This draft cannot be deleted while payment is being processed.",
      );
    }
    if (!attempt.stripeCheckoutSessionId) {
      throw new EventLifecycleBlockedError(
        "Checkout is still being prepared. Wait a moment and try again.",
      );
    }
    const { stripe } = this.configured();
    const session = await stripe.retrieveCheckout(
      attempt.stripeCheckoutSessionId,
    );
    if (session.paymentStatus === "PAID" || session.status === "COMPLETE") {
      await this.fulfillSession(session, audit);
      throw new EventLifecycleBlockedError(
        "Payment completed while deletion was requested. Review the publication status before continuing.",
      );
    }
    if (session.status === "OPEN") {
      await stripe.expireCheckout(session.id);
      await this.payments.markAttemptCanceled({
        attemptId: attempt.id,
        userId: user.id,
        audit,
      });
      return;
    }
    await this.payments.markAttemptExpired({
      attemptId: attempt.id,
      expectedVersion: attempt.version,
      reconciledAt: this.now(),
      audit,
    });
  }

  async status(
    principal: AuthPrincipal | null,
    eventId: string,
  ): Promise<PaymentStatusDto> {
    const user = requireUserPrincipal(principal);
    const event = await this.ownedEvent(user, eventId);
    const [attempt, publication] = await Promise.all([
      this.payments.findLatestOwnedAttempt(event.id, user.id),
      this.payments.findPublicationForEvent(event.id),
    ]);
    let displayState: PaymentStatusDto["displayState"];
    if (event.canceledAt) displayState = "CANCELED";
    else if (publication) displayState = "PUBLISHED";
    else if (!attempt) {
      displayState =
        event.approvalStatus === "APPROVED"
          ? "READY_FOR_PAYMENT"
          : eventReadiness(event).ready
            ? "READY_FOR_REVIEW"
            : "DRAFT_INCOMPLETE";
    } else if (attempt.fulfillmentState === "MANUAL_REVIEW") {
      displayState = "MANUAL_REVIEW_REQUIRED";
    } else if (attempt.fulfillmentState === "BLOCKED") {
      displayState = "PAID_PUBLICATION_BLOCKED";
    } else if (attempt.fulfillmentState === "RETRYING") {
      displayState = "FULFILLMENT_RETRYING";
    } else if (attempt.paymentState === "PAID") {
      displayState = "PAYMENT_RECEIVED_PUBLISHING";
    } else if (attempt.checkoutState === "CANCELED") {
      displayState = "PAYMENT_CANCELED";
    } else if (attempt.checkoutState === "EXPIRED") {
      displayState = "CHECKOUT_EXPIRED";
    } else if (
      attempt.checkoutState === "COMPLETE" ||
      attempt.paymentState === "PENDING"
    ) {
      displayState = "PAYMENT_PENDING";
    } else {
      displayState = "CHECKOUT_CREATED";
    }
    return {
      eventId: event.id,
      displayState,
      message: statusMessage(displayState),
      price: this.price,
      attemptId: attempt?.id ?? null,
      checkoutSessionId: attempt?.stripeCheckoutSessionId ?? null,
      paymentState: attempt?.paymentState ?? null,
      fulfillmentState: attempt?.fulfillmentState ?? null,
      canonicalPath: publication?.canonicalPath ?? null,
      publishedAt: publication?.publishedAt.toISOString() ?? null,
      recoverable: Boolean(
        attempt &&
        ["PROCESSING", "RETRYING", "BLOCKED"].includes(
          attempt.fulfillmentState,
        ),
      ),
      updatedAt: (attempt?.updatedAt ?? event.updatedAt).toISOString(),
    };
  }

  async handleWebhook(
    rawBody: string,
    signature: string,
  ): Promise<{
    readonly duplicate: boolean;
    readonly ignored: boolean;
    readonly fulfillment: FulfillmentResult | null;
  }> {
    const { stripe } = this.configured();
    const event = stripe.verifyWebhook(rawBody, signature);
    const disposition = await this.payments.beginWebhook(event);
    if (disposition === "ALREADY_PROCESSED") {
      return { duplicate: true, ignored: false, fulfillment: null };
    }
    if (!SUPPORTED_WEBHOOK_EVENTS.has(event.type)) {
      await this.payments.completeWebhook(event.id, true, this.now());
      return { duplicate: false, ignored: true, fulfillment: null };
    }
    try {
      if (!event.checkoutSessionId) {
        throw new PaymentError(
          "PAYMENT_MISMATCH",
          "The webhook event does not identify a Checkout Session.",
        );
      }
      const session = await stripe.retrieveCheckout(event.checkoutSessionId);
      let fulfillment: FulfillmentResult;
      if (event.type === "checkout.session.async_payment_failed") {
        const attempt = await this.resolveAttempt(session);
        await this.payments.recordFailedSession({
          attempt,
          session,
          reason: "ASYNC_PAYMENT_FAILED",
          now: this.now(),
        });
        fulfillment = {
          disposition: "TERMINAL_UNPAID",
          attemptId: attempt.id,
          canonicalPath: null,
        };
      } else if (event.type === "checkout.session.expired") {
        const attempt = await this.resolveAttempt(session);
        await this.payments.markAttemptExpired({
          attemptId: attempt.id,
          expectedVersion: attempt.version,
          reconciledAt: this.now(),
        });
        fulfillment = {
          disposition: "TERMINAL_UNPAID",
          attemptId: attempt.id,
          canonicalPath: null,
        };
      } else {
        fulfillment = await this.fulfillSession(session, {});
      }
      await this.payments.completeWebhook(event.id, false, this.now());
      return { duplicate: false, ignored: false, fulfillment };
    } catch (error) {
      await this.payments
        .failWebhook(
          event.id,
          error instanceof PaymentError
            ? error.code
            : "WEBHOOK_PROCESSING_FAILED",
        )
        .catch(() => undefined);
      throw error;
    }
  }

  private async resolveAttempt(
    session: HostedCheckoutSession,
  ): Promise<PaymentAttemptRecord> {
    const known = await this.payments.findAttemptBySessionId(session.id);
    if (known) return known;
    const candidateId = session.metadata.paymentAttemptId;
    if (!candidateId || !DATABASE_ID.test(candidateId)) {
      throw new PaymentError(
        "PAYMENT_MISMATCH",
        "Checkout does not identify an internal payment attempt.",
      );
    }
    const candidate = await this.payments.findAttemptById(candidateId);
    if (!candidate) {
      throw new PaymentError(
        "PAYMENT_MISMATCH",
        "The internal payment attempt was not found.",
      );
    }
    const metadata = correlationMetadata(candidate);
    if (
      session.metadata.eventId !== metadata.eventId ||
      session.metadata.approvedRevision !== metadata.approvedRevision ||
      session.metadata.approvalDigest !== metadata.approvalDigest ||
      session.metadata.applicationEnvironment !==
        metadata.applicationEnvironment
    ) {
      throw new PaymentError(
        "PAYMENT_MISMATCH",
        "Checkout correlation does not match the payment attempt.",
      );
    }
    const attached = await this.payments.attachRecoveredCheckout({
      attemptId: candidate.id,
      session,
    });
    if (!attached) {
      const raced = await this.payments.findAttemptBySessionId(session.id);
      if (raced) return raced;
      throw new FulfillmentRetryingError();
    }
    return attached;
  }

  async fulfillSession(
    session: HostedCheckoutSession,
    audit: PaymentAuditContext = {},
  ): Promise<FulfillmentResult> {
    const attempt = await this.resolveAttempt(session);
    const publication = await this.payments.findPublicationForEvent(
      attempt.eventId,
    );
    if (publication) {
      if (publication.paymentAttemptId === attempt.id) {
        return {
          disposition: "ALREADY_FULFILLED",
          attemptId: attempt.id,
          canonicalPath: publication.canonicalPath,
        };
      }
      return this.payments.recordPaidBlocked({
        attempt,
        session,
        reason: "CONFLICTING_PUBLICATION",
        now: this.now(),
        audit,
      });
    }
    if (session.status === "EXPIRED") {
      await this.payments.markAttemptExpired({
        attemptId: attempt.id,
        expectedVersion: attempt.version,
        reconciledAt: this.now(),
        audit,
      });
      return {
        disposition: "TERMINAL_UNPAID",
        attemptId: attempt.id,
        canonicalPath: null,
      };
    }
    if (session.paymentStatus !== "PAID") {
      await this.payments.recordPendingSession({
        attempt,
        session,
        now: this.now(),
      });
      return {
        disposition: "PENDING",
        attemptId: attempt.id,
        canonicalPath: null,
      };
    }
    const mismatch = sessionMismatch(attempt, session);
    if (mismatch) {
      return this.payments.recordPaidBlocked({
        attempt,
        session,
        reason: mismatch,
        now: this.now(),
        audit,
      });
    }
    const event = await this.events.findOwned(attempt.eventId, attempt.userId);
    if (!event || event.organizerId !== attempt.organizerId) {
      return this.payments.recordPaidBlocked({
        attempt,
        session,
        reason: "ORGANIZER_OR_OWNERSHIP_INELIGIBLE",
        now: this.now(),
        audit,
      });
    }
    const eligibility = fulfillmentEligibility(event, attempt, this.now());
    if (!eligibility.eligible) {
      return this.payments.recordPaidBlocked({
        attempt,
        session,
        reason: eligibility.reason,
        now: this.now(),
        audit,
      });
    }
    const result = await this.payments.publish({
      attempt,
      session,
      event,
      expectedEventVersion: event.version,
      snapshot: createPublicationSnapshot(event),
      now: this.now(),
      audit,
    });
    if (result.canonicalPath) {
      await this.cache.revalidate(result.canonicalPath);
    }
    return result;
  }

  async reconcileAttempt(attemptId: string): Promise<FulfillmentResult> {
    if (!DATABASE_ID.test(attemptId)) throw new FulfillmentRetryingError();
    const attempt = await this.payments.findAttemptById(attemptId);
    if (!attempt?.stripeCheckoutSessionId) {
      throw new FulfillmentRetryingError(
        "The payment attempt has no recoverable Checkout Session yet.",
      );
    }
    const { stripe } = this.configured();
    try {
      const result = await this.fulfillSession(
        await stripe.retrieveCheckout(attempt.stripeCheckoutSessionId),
        {},
      );
      if (result.disposition === "PENDING") {
        await this.payments.markReconciliationRetrying({
          attemptId: attempt.id,
          reason: "PAYMENT_STILL_PENDING",
          now: this.now(),
        });
        throw new FulfillmentRetryingError("Stripe payment is still pending.");
      }
      return result;
    } catch (error) {
      if (error instanceof FulfillmentRetryingError) throw error;
      if (error instanceof StripeProviderError) {
        await this.payments.markReconciliationRetrying({
          attemptId: attempt.id,
          reason: error.providerCode,
          now: this.now(),
        });
        throw new FulfillmentRetryingError();
      }
      throw error;
    }
  }

  async enqueueReconciliationCandidates(limit = 50): Promise<number> {
    const candidates = await this.payments.findReconciliationCandidates({
      now: this.now(),
      limit,
    });
    await Promise.all(
      candidates.map((attemptId) =>
        this.payments.enqueueReconciliation({
          attemptId,
          runAt: this.now(),
        }),
      ),
    );
    return candidates.length;
  }

  async cancelReturn(
    principal: AuthPrincipal | null,
    eventId: string,
    attemptId: string,
    audit: PaymentAuditContext = {},
  ): Promise<void> {
    const user = requireUserPrincipal(principal);
    await this.ownedEvent(user, eventId);
    if (!DATABASE_ID.test(attemptId)) return;
    const attempt = await this.payments.findAttemptById(attemptId);
    if (
      !attempt ||
      attempt.eventId !== eventId ||
      attempt.userId !== user.id ||
      !attempt.stripeCheckoutSessionId ||
      attempt.paymentState === "PAID"
    ) {
      return;
    }
    const { stripe } = this.configured();
    const session = await stripe.retrieveCheckout(
      attempt.stripeCheckoutSessionId,
    );
    if (session.paymentStatus === "PAID" || session.status === "COMPLETE") {
      await this.fulfillSession(session, audit);
      return;
    }
    if (session.status === "OPEN") {
      await stripe.expireCheckout(session.id);
    }
    await this.payments.markAttemptCanceled({
      attemptId,
      userId: user.id,
      audit,
    });
  }

  async expireOpenCheckoutForAdminRemoval(
    eventId: string,
    audit: PaymentAuditContext = {},
  ): Promise<void> {
    if (!DATABASE_ID.test(eventId)) return;
    const attempt = await this.payments.findActiveAttempt(eventId);
    if (
      !attempt?.stripeCheckoutSessionId ||
      attempt.paymentState === "PAID"
    ) {
      return;
    }
    const { stripe } = this.configured();
    const session = await stripe.retrieveCheckout(
      attempt.stripeCheckoutSessionId,
    );
    if (session.paymentStatus === "PAID" || session.status === "COMPLETE") {
      await this.fulfillSession(session, audit);
      return;
    }
    if (session.status === "OPEN") {
      await stripe.expireCheckout(session.id);
    }
    await this.payments.markAttemptExpired({
      attemptId: attempt.id,
      expectedVersion: attempt.version,
      reconciledAt: this.now(),
      audit,
    });
  }

  async published(
    eventType: "ESTATE_SALE" | "YARD_SALE",
    publicId: string,
    now = this.now(),
  ): Promise<PublishedListing | null> {
    if (!/^[0-9a-f]{12}$/.test(publicId)) return null;
    const publication = await this.payments.findPublishedByPublicId({
      publicId,
      eventType,
    });
    return publication
      ? publishedListing({
          eventId: publication.eventId,
          approvedRevision: publication.approvedRevision,
          canonicalPath: publication.canonicalPath,
          publishedAt: publication.publishedAt,
          verifiedEmail: publication.verifiedEmail,
          snapshot: publication.snapshot,
          now,
        })
      : null;
  }
}
