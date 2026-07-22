export type PaymentErrorCode =
  | "PAYMENT_CONFIGURATION_UNAVAILABLE"
  | "EVENT_NOT_APPROVED"
  | "STALE_APPROVAL"
  | "INVALID_SCHEDULE"
  | "INCOMPLETE_PHOTOS"
  | "ACTIVE_CHECKOUT_EXISTS"
  | "ALREADY_PUBLISHED"
  | "PAYMENT_PENDING"
  | "PAID_BUT_BLOCKED"
  | "WEBHOOK_SIGNATURE_INVALID"
  | "PAYMENT_MISMATCH"
  | "FULFILLMENT_RETRYING"
  | "STRIPE_UNAVAILABLE";

export class PaymentError extends Error {
  override readonly name = "PaymentError";

  constructor(
    readonly code: PaymentErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export class PaymentConfigurationError extends PaymentError {
  constructor() {
    super(
      "PAYMENT_CONFIGURATION_UNAVAILABLE",
      "Payment configuration is not available for this environment.",
    );
  }
}

export class EventNotApprovedForPaymentError extends PaymentError {
  constructor(message = "Approve the current event revision before payment.") {
    super("EVENT_NOT_APPROVED", message);
  }
}

export class StaleApprovalError extends PaymentError {
  constructor(message = "The approved event revision is no longer current.") {
    super("STALE_APPROVAL", message);
  }
}

export class InvalidPaymentScheduleError extends PaymentError {
  constructor(
    message = "The event schedule is no longer eligible for payment.",
  ) {
    super("INVALID_SCHEDULE", message);
  }
}

export class IncompletePaymentPhotosError extends PaymentError {
  constructor(
    message = "The event needs a ready photo and cover before payment.",
  ) {
    super("INCOMPLETE_PHOTOS", message);
  }
}

export class ActiveCheckoutError extends PaymentError {
  constructor(message = "A compatible Checkout Session is already active.") {
    super("ACTIVE_CHECKOUT_EXISTS", message);
  }
}

export class AlreadyPublishedError extends PaymentError {
  constructor(message = "This event is already published.") {
    super("ALREADY_PUBLISHED", message);
  }
}

export class WebhookSignatureError extends PaymentError {
  constructor() {
    super("WEBHOOK_SIGNATURE_INVALID", "The webhook signature is invalid.");
  }
}

export class PaymentMismatchError extends PaymentError {
  constructor(message = "The payment does not match the approved listing.") {
    super("PAYMENT_MISMATCH", message);
  }
}

export class FulfillmentRetryingError extends PaymentError {
  constructor(message = "Payment fulfillment is waiting for a safe retry.") {
    super("FULFILLMENT_RETRYING", message);
  }
}

export class StripeProviderError extends PaymentError {
  constructor(
    readonly providerCode: string,
    options?: ErrorOptions,
  ) {
    super(
      "STRIPE_UNAVAILABLE",
      "Stripe Checkout is temporarily unavailable.",
      options,
    );
  }
}
