import "server-only";

import Stripe from "stripe";

import { StripeProviderError, WebhookSignatureError } from "../domain/errors";
import type {
  HostedCheckoutSession,
  VerifiedStripeWebhookEvent,
} from "../domain/types";
import type {
  CreateHostedCheckoutInput,
  StripeProvider,
} from "../application/ports";

function providerError(error: unknown): StripeProviderError {
  const providerCode =
    error instanceof Stripe.errors.StripeRateLimitError
      ? "RATE_LIMITED"
      : error instanceof Stripe.errors.StripeAPIError
        ? "PROVIDER_API_ERROR"
        : error instanceof Stripe.errors.StripeConnectionError
          ? "PROVIDER_CONNECTION_ERROR"
          : error instanceof Stripe.errors.StripeInvalidRequestError
            ? "PROVIDER_REQUEST_REJECTED"
            : "PROVIDER_ERROR";
  return new StripeProviderError(providerCode, { cause: error });
}

function mapSession(session: Stripe.Checkout.Session): HostedCheckoutSession {
  const status = {
    open: "OPEN",
    complete: "COMPLETE",
    expired: "EXPIRED",
  }[session.status ?? "open"] as HostedCheckoutSession["status"];
  const paymentStatus = {
    unpaid: "UNPAID",
    paid: "PAID",
    no_payment_required: "NO_PAYMENT_REQUIRED",
  }[session.payment_status] as HostedCheckoutSession["paymentStatus"];
  return {
    id: session.id,
    url: session.url,
    status,
    paymentStatus,
    paymentIntentId:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? null),
    amountTotal: session.amount_total,
    currency: session.currency?.toLowerCase() ?? null,
    expiresAt: new Date(session.expires_at * 1000),
    metadata: session.metadata ?? {},
    lineItems:
      session.line_items?.data.map((item) => ({
        priceId:
          typeof item.price === "string" ? item.price : (item.price?.id ?? ""),
        amount:
          typeof item.price === "string"
            ? null
            : (item.price?.unit_amount ?? null),
        currency:
          typeof item.price === "string"
            ? null
            : (item.price?.currency.toLowerCase() ?? null),
        quantity: item.quantity,
      })) ?? [],
  };
}

export class StripeCheckoutProvider implements StripeProvider {
  private readonly stripe: Stripe;

  constructor(
    secretKey: string,
    private readonly webhookSecret: string,
    stripeClient?: Stripe,
  ) {
    this.stripe =
      stripeClient ?? new Stripe(secretKey, { maxNetworkRetries: 2 });
  }

  async createHostedCheckout(
    input: CreateHostedCheckoutInput,
  ): Promise<HostedCheckoutSession> {
    try {
      const session = await this.stripe.checkout.sessions.create(
        {
          mode: "payment",
          payment_method_types: ["card"],
          line_items: [{ price: input.price.priceId, quantity: 1 }],
          client_reference_id: input.metadata.paymentAttemptId,
          metadata: { ...input.metadata },
          payment_intent_data: { metadata: { ...input.metadata } },
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          expires_at: Math.floor(input.expiresAt.getTime() / 1000),
          allow_promotion_codes: false,
          submit_type: "pay",
        },
        { idempotencyKey: input.idempotencyKey },
      );
      return mapSession(session);
    } catch (error) {
      throw providerError(error);
    }
  }

  async retrieveCheckout(sessionId: string): Promise<HostedCheckoutSession> {
    try {
      return mapSession(
        await this.stripe.checkout.sessions.retrieve(sessionId, {
          expand: ["line_items.data.price"],
        }),
      );
    } catch (error) {
      throw providerError(error);
    }
  }

  async expireCheckout(sessionId: string): Promise<HostedCheckoutSession> {
    try {
      return mapSession(await this.stripe.checkout.sessions.expire(sessionId));
    } catch (error) {
      throw providerError(error);
    }
  }

  verifyWebhook(
    rawBody: string,
    signature: string,
  ): VerifiedStripeWebhookEvent {
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      );
    } catch {
      throw new WebhookSignatureError();
    }
    const object = event.data.object as { id?: unknown };
    return {
      id: event.id,
      type: event.type,
      createdAt: new Date(event.created * 1000),
      checkoutSessionId:
        typeof object.id === "string" && object.id.startsWith("cs_")
          ? object.id
          : null,
    };
  }
}
