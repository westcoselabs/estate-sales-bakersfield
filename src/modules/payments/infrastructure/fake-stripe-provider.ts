import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { StripeProviderError, WebhookSignatureError } from "../domain/errors";
import type {
  HostedCheckoutSession,
  PublicationPrice,
  VerifiedStripeWebhookEvent,
} from "../domain/types";
import type {
  CreateHostedCheckoutInput,
  StripeProvider,
} from "../application/ports";

const FAKE_WEBHOOK_SECRET =
  "phase-four-deterministic-fake-stripe-webhook-secret";

interface StoredFakeSession {
  session: HostedCheckoutSession;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
  lastEvent: { readonly body: string; readonly signature: string } | null;
}

declare global {
  var __estateSalesFakeStripeSessions:
    Map<string, StoredFakeSession> | undefined;
  var __estateSalesFakeStripeIdempotency: Map<string, string> | undefined;
}

function sessions(): Map<string, StoredFakeSession> {
  globalThis.__estateSalesFakeStripeSessions ??= new Map();
  return globalThis.__estateSalesFakeStripeSessions;
}

function idempotency(): Map<string, string> {
  globalThis.__estateSalesFakeStripeIdempotency ??= new Map();
  return globalThis.__estateSalesFakeStripeIdempotency;
}

function identifier(prefix: string, value: string): string {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
}

function cloneSession(session: HostedCheckoutSession): HostedCheckoutSession {
  return {
    ...session,
    expiresAt: new Date(session.expiresAt),
    metadata: { ...session.metadata },
    lineItems: session.lineItems.map((item) => ({ ...item })),
  };
}

function stored(sessionId: string): StoredFakeSession {
  const value = sessions().get(sessionId);
  if (!value) throw new StripeProviderError("SESSION_NOT_FOUND");
  return value;
}

function signatureFor(body: string, timestamp: number): string {
  const digest = createHmac("sha256", FAKE_WEBHOOK_SECRET)
    .update(`${String(timestamp)}.${body}`)
    .digest("hex");
  return `t=${String(timestamp)},v1=${digest}`;
}

export class FakeStripeProvider implements StripeProvider {
  constructor(
    private readonly applicationUrl: URL,
    private readonly price: PublicationPrice,
  ) {}

  createHostedCheckout(
    input: CreateHostedCheckoutInput,
  ): Promise<HostedCheckoutSession> {
    const priorId = idempotency().get(input.idempotencyKey);
    if (priorId) return Promise.resolve(cloneSession(stored(priorId).session));
    if (
      input.price.priceId !== this.price.priceId ||
      input.price.amount !== this.price.amount ||
      input.price.currency !== this.price.currency
    ) {
      throw new StripeProviderError("FIXTURE_PRICE_MISMATCH");
    }
    const id = identifier("cs_test", input.idempotencyKey);
    const session: HostedCheckoutSession = {
      id,
      url: new URL(`/test-checkout/${id}`, this.applicationUrl).toString(),
      status: "OPEN",
      paymentStatus: "UNPAID",
      paymentIntentId: null,
      amountTotal: input.price.amount,
      currency: input.price.currency,
      expiresAt: input.expiresAt,
      metadata: { ...input.metadata },
      lineItems: [
        {
          priceId: input.price.priceId,
          amount: input.price.amount,
          currency: input.price.currency,
          quantity: 1,
        },
      ],
    };
    sessions().set(id, {
      session,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      idempotencyKey: input.idempotencyKey,
      lastEvent: null,
    });
    idempotency().set(input.idempotencyKey, id);
    return Promise.resolve(cloneSession(session));
  }

  retrieveCheckout(sessionId: string): Promise<HostedCheckoutSession> {
    return Promise.resolve(cloneSession(stored(sessionId).session));
  }

  expireCheckout(sessionId: string): Promise<HostedCheckoutSession> {
    const value = stored(sessionId);
    if (value.session.status === "OPEN") {
      value.session = { ...value.session, status: "EXPIRED", url: null };
    }
    return Promise.resolve(cloneSession(value.session));
  }

  verifyWebhook(
    rawBody: string,
    signature: string,
  ): VerifiedStripeWebhookEvent {
    const fields = Object.fromEntries(
      signature.split(",").map((item) => item.split("=", 2)),
    );
    const timestamp = Number(fields.t);
    const received = fields.v1;
    if (!Number.isInteger(timestamp) || !received) {
      throw new WebhookSignatureError();
    }
    const expected = signatureFor(rawBody, timestamp).split("v1=")[1] ?? "";
    const expectedBytes = Buffer.from(expected, "hex");
    const receivedBytes = Buffer.from(received, "hex");
    if (
      expectedBytes.length !== receivedBytes.length ||
      !timingSafeEqual(expectedBytes, receivedBytes) ||
      Math.abs(Date.now() / 1000 - timestamp) > 300
    ) {
      throw new WebhookSignatureError();
    }
    try {
      const payload = JSON.parse(rawBody) as {
        id: string;
        type: string;
        created: number;
        data: { object: { id: string } };
      };
      return {
        id: payload.id,
        type: payload.type,
        createdAt: new Date(payload.created * 1000),
        checkoutSessionId: payload.data.object.id,
      };
    } catch {
      throw new WebhookSignatureError();
    }
  }
}

export function fakeCheckoutDetails(sessionId: string): {
  readonly session: HostedCheckoutSession;
  readonly successUrl: string;
  readonly cancelUrl: string;
} {
  const value = stored(sessionId);
  return {
    session: cloneSession(value.session),
    successUrl: value.successUrl,
    cancelUrl: value.cancelUrl,
  };
}

export function completeFakeCheckout(sessionId: string): {
  readonly body: string;
  readonly signature: string;
  readonly redirectUrl: string;
} {
  const value = stored(sessionId);
  if (value.session.status === "EXPIRED") {
    throw new StripeProviderError("SESSION_EXPIRED");
  }
  value.session = {
    ...value.session,
    status: "COMPLETE",
    paymentStatus: "PAID",
    paymentIntentId: identifier("pi_test", sessionId),
    url: null,
  };
  if (!value.lastEvent) {
    const created = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({
      id: identifier("evt_test", sessionId),
      type: "checkout.session.completed",
      created,
      data: { object: { id: sessionId } },
    });
    value.lastEvent = { body, signature: signatureFor(body, created) };
  }
  return {
    ...value.lastEvent,
    redirectUrl: value.successUrl.replace("{CHECKOUT_SESSION_ID}", sessionId),
  };
}

export function cancelFakeCheckout(sessionId: string): string {
  return stored(sessionId).cancelUrl;
}

export function fakeWebhookEvent(input: {
  readonly sessionId: string;
  readonly eventId: string;
  readonly type:
    | "checkout.session.completed"
    | "checkout.session.async_payment_succeeded"
    | "checkout.session.async_payment_failed"
    | "checkout.session.expired";
  readonly created?: number;
}): { readonly body: string; readonly signature: string } {
  stored(input.sessionId);
  const created = input.created ?? Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    id: input.eventId,
    type: input.type,
    created,
    data: { object: { id: input.sessionId } },
  });
  return { body, signature: signatureFor(body, created) };
}

export function resetFakeStripeForTests(): void {
  sessions().clear();
  idempotency().clear();
}
