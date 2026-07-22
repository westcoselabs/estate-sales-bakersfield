import type {
  AddressPrivacyMode,
  PublicEventProjection,
} from "@/modules/events";

export type ApplicationEnvironment =
  "local" | "test" | "preview" | "production";

export type PaymentCheckoutState =
  "CREATING" | "OPEN" | "COMPLETE" | "EXPIRED" | "CANCELED" | "FAILED";
export type PaymentState = "UNPAID" | "PENDING" | "PAID" | "FAILED";
export type PaymentFulfillmentState =
  | "NOT_STARTED"
  | "PROCESSING"
  | "RETRYING"
  | "FULFILLED"
  | "BLOCKED"
  | "MANUAL_REVIEW";

export interface PublicationPrice {
  readonly priceId: string;
  readonly amount: number;
  readonly currency: string;
  readonly fixture: boolean;
}

export interface CheckoutCorrelationMetadata {
  readonly paymentAttemptId: string;
  readonly eventId: string;
  readonly approvedRevision: string;
  readonly approvalDigest: string;
  readonly applicationEnvironment: ApplicationEnvironment;
}

export interface CheckoutLineItem {
  readonly priceId: string;
  readonly amount: number | null;
  readonly currency: string | null;
  readonly quantity: number | null;
}

export interface HostedCheckoutSession {
  readonly id: string;
  readonly url: string | null;
  readonly status: "OPEN" | "COMPLETE" | "EXPIRED";
  readonly paymentStatus: "UNPAID" | "PAID" | "NO_PAYMENT_REQUIRED";
  readonly paymentIntentId: string | null;
  readonly amountTotal: number | null;
  readonly currency: string | null;
  readonly expiresAt: Date;
  readonly metadata: Readonly<Record<string, string>>;
  readonly lineItems: readonly CheckoutLineItem[];
}

export interface VerifiedStripeWebhookEvent {
  readonly id: string;
  readonly type: string;
  readonly createdAt: Date;
  readonly checkoutSessionId: string | null;
}

export interface PaymentAttemptRecord {
  readonly id: string;
  readonly eventId: string;
  readonly organizerId: string;
  readonly userId: string;
  readonly approvalId: string;
  readonly approvedRevision: number;
  readonly approvedDigest: string;
  readonly attemptGeneration: number;
  readonly environment: ApplicationEnvironment;
  readonly stripeCheckoutSessionId: string | null;
  readonly stripePaymentIntentId: string | null;
  readonly stripePriceId: string;
  readonly expectedAmount: number;
  readonly expectedCurrency: string;
  readonly checkoutState: PaymentCheckoutState;
  readonly paymentState: PaymentState;
  readonly fulfillmentState: PaymentFulfillmentState;
  readonly expiresAt: Date | null;
  readonly paidAt: Date | null;
  readonly fulfilledAt: Date | null;
  readonly lastReconciledAt: Date | null;
  readonly failureReason: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PublicationSnapshot {
  readonly schema: "estate-sales-publication-v1";
  readonly privacyMode: AddressPrivacyMode;
  readonly projection: PublicEventProjection;
}

export interface PublicationRecord {
  readonly id: string;
  readonly eventId: string;
  readonly paymentAttemptId: string;
  readonly approvedRevision: number;
  readonly approvalDigest: string;
  readonly publicId: string;
  readonly canonicalPath: string;
  readonly snapshot: PublicationSnapshot;
  readonly publishedAt: Date;
}

export type PaymentDisplayState =
  | "DRAFT_INCOMPLETE"
  | "READY_FOR_REVIEW"
  | "APPROVED"
  | "READY_FOR_PAYMENT"
  | "CHECKOUT_CREATED"
  | "PAYMENT_PENDING"
  | "PAYMENT_RECEIVED_PUBLISHING"
  | "PUBLISHED"
  | "PAYMENT_CANCELED"
  | "CHECKOUT_EXPIRED"
  | "PAID_PUBLICATION_BLOCKED"
  | "FULFILLMENT_RETRYING"
  | "MANUAL_REVIEW_REQUIRED";

export interface PaymentStatusDto {
  readonly eventId: string;
  readonly displayState: PaymentDisplayState;
  readonly message: string;
  readonly price: PublicationPrice | null;
  readonly attemptId: string | null;
  readonly checkoutSessionId: string | null;
  readonly paymentState: PaymentState | null;
  readonly fulfillmentState: PaymentFulfillmentState | null;
  readonly canonicalPath: string | null;
  readonly publishedAt: string | null;
  readonly recoverable: boolean;
  readonly updatedAt: string;
}

export interface CheckoutRedirectDto {
  readonly attemptId: string;
  readonly checkoutUrl: string;
  readonly expiresAt: string;
}

export interface FulfillmentResult {
  readonly disposition:
    | "FULFILLED"
    | "ALREADY_FULFILLED"
    | "BLOCKED"
    | "PENDING"
    | "TERMINAL_UNPAID";
  readonly attemptId: string;
  readonly canonicalPath: string | null;
}

export interface PublishedListing {
  readonly eventId: string;
  readonly approvedRevision: number;
  readonly canonicalPath: string;
  readonly publishedAt: Date;
  readonly projection: PublicEventProjection;
}
