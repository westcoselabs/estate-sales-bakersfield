import type { EventRecord } from "@/modules/events";

import type {
  ApplicationEnvironment,
  CheckoutCorrelationMetadata,
  FulfillmentResult,
  HostedCheckoutSession,
  PaymentAttemptRecord,
  PublicationPrice,
  PublicationRecord,
  PublicationSnapshot,
  VerifiedStripeWebhookEvent,
} from "../domain/types";

export interface CreateHostedCheckoutInput {
  readonly price: PublicationPrice;
  readonly metadata: CheckoutCorrelationMetadata;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly expiresAt: Date;
  readonly idempotencyKey: string;
}

export interface StripeProvider {
  createHostedCheckout(
    input: CreateHostedCheckoutInput,
  ): Promise<HostedCheckoutSession>;
  retrieveCheckout(sessionId: string): Promise<HostedCheckoutSession>;
  expireCheckout(sessionId: string): Promise<HostedCheckoutSession>;
  verifyWebhook(rawBody: string, signature: string): VerifiedStripeWebhookEvent;
}

export interface PaymentAuditContext {
  readonly requestId?: string;
}

export interface PaymentRepository {
  findActiveAttempt(eventId: string): Promise<PaymentAttemptRecord | null>;
  createAttempt(input: {
    readonly event: EventRecord;
    readonly expectedEventVersion: number;
    readonly userId: string;
    readonly approvalId: string;
    readonly approvedRevision: number;
    readonly approvedDigest: string;
    readonly price: PublicationPrice;
    readonly environment: ApplicationEnvironment;
    readonly audit: PaymentAuditContext;
  }): Promise<PaymentAttemptRecord>;
  attachCheckout(input: {
    readonly attemptId: string;
    readonly expectedVersion: number;
    readonly session: HostedCheckoutSession;
    readonly reconciliationRunAt: Date;
    readonly audit: PaymentAuditContext;
  }): Promise<PaymentAttemptRecord | null>;
  markCheckoutCreationFailed(input: {
    readonly attemptId: string;
    readonly expectedVersion: number;
    readonly reason: string;
    readonly audit: PaymentAuditContext;
  }): Promise<void>;
  markAttemptExpired(input: {
    readonly attemptId: string;
    readonly expectedVersion: number;
    readonly reconciledAt: Date;
    readonly audit?: PaymentAuditContext;
  }): Promise<void>;
  markAttemptCanceled(input: {
    readonly attemptId: string;
    readonly userId: string;
    readonly audit: PaymentAuditContext;
  }): Promise<void>;
  findAttemptById(attemptId: string): Promise<PaymentAttemptRecord | null>;
  findAttemptBySessionId(
    checkoutSessionId: string,
  ): Promise<PaymentAttemptRecord | null>;
  attachRecoveredCheckout(input: {
    readonly attemptId: string;
    readonly session: HostedCheckoutSession;
  }): Promise<PaymentAttemptRecord | null>;
  findLatestOwnedAttempt(
    eventId: string,
    userId: string,
  ): Promise<PaymentAttemptRecord | null>;
  findPublicationForEvent(eventId: string): Promise<PublicationRecord | null>;
  beginWebhook(
    event: VerifiedStripeWebhookEvent,
  ): Promise<"PROCESS" | "ALREADY_PROCESSED">;
  completeWebhook(eventId: string, ignored: boolean, now: Date): Promise<void>;
  failWebhook(eventId: string, reason: string): Promise<void>;
  recordPendingSession(input: {
    readonly attempt: PaymentAttemptRecord;
    readonly session: HostedCheckoutSession;
    readonly now: Date;
  }): Promise<void>;
  recordFailedSession(input: {
    readonly attempt: PaymentAttemptRecord;
    readonly session: HostedCheckoutSession;
    readonly reason: string;
    readonly now: Date;
  }): Promise<void>;
  recordPaidBlocked(input: {
    readonly attempt: PaymentAttemptRecord;
    readonly session: HostedCheckoutSession;
    readonly reason: string;
    readonly now: Date;
    readonly audit: PaymentAuditContext;
  }): Promise<FulfillmentResult>;
  publish(input: {
    readonly attempt: PaymentAttemptRecord;
    readonly session: HostedCheckoutSession;
    readonly event: EventRecord;
    readonly expectedEventVersion: number;
    readonly snapshot: PublicationSnapshot;
    readonly now: Date;
    readonly audit: PaymentAuditContext;
  }): Promise<FulfillmentResult>;
  markReconciliationRetrying(input: {
    readonly attemptId: string;
    readonly reason: string;
    readonly now: Date;
  }): Promise<void>;
  findReconciliationCandidates(input: {
    readonly now: Date;
    readonly limit: number;
  }): Promise<readonly string[]>;
  enqueueReconciliation(input: {
    readonly attemptId: string;
    readonly runAt: Date;
  }): Promise<void>;
  findPublishedByPublicId(input: {
    readonly publicId: string;
    readonly eventType: "ESTATE_SALE" | "YARD_SALE";
  }): Promise<PublicationRecord | null>;
}

export interface PublicationCache {
  revalidate(canonicalPath: string): void | Promise<void>;
}
