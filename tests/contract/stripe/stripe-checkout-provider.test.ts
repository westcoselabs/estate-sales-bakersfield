import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

import { StripeCheckoutProvider } from "@/modules/payments/infrastructure/stripe-checkout-provider";
import type { CreateHostedCheckoutInput } from "@/modules/payments/application/ports";

const input: CreateHostedCheckoutInput = {
  price: {
    priceId: "price_test_contract_fixture",
    amount: 1234,
    currency: "usd",
    fixture: true,
  },
  metadata: {
    paymentAttemptId: "55555555-5555-4555-8555-555555555555",
    eventId: "22222222-2222-4222-8222-222222222222",
    approvedRevision: "6",
    approvalDigest: "a".repeat(64),
    applicationEnvironment: "test",
  },
  successUrl:
    "https://preview.example.test/dashboard/events/22222222-2222-4222-8222-222222222222/payment/success?session_id={CHECKOUT_SESSION_ID}",
  cancelUrl:
    "https://preview.example.test/dashboard/events/22222222-2222-4222-8222-222222222222/payment/cancel?attempt=55555555-5555-4555-8555-555555555555",
  expiresAt: new Date("2026-08-21T20:00:00.000Z"),
  idempotencyKey: "phase4:test:55555555-5555-4555-8555-555555555555:g1",
};

function stripeSession(
  changes: Partial<Stripe.Checkout.Session> = {},
): Stripe.Checkout.Session {
  return {
    id: "cs_test_contract",
    object: "checkout.session",
    status: "open",
    payment_status: "unpaid",
    payment_intent: null,
    amount_total: 1234,
    currency: "usd",
    expires_at: Math.floor(input.expiresAt.getTime() / 1000),
    metadata: { ...input.metadata },
    url: "https://checkout.stripe.example.test/session",
    line_items: {
      object: "list",
      data: [
        {
          id: "li_contract",
          object: "item",
          amount_discount: 0,
          amount_subtotal: 1234,
          amount_tax: 0,
          amount_total: 1234,
          currency: "usd",
          description: "Publication",
          discounts: [],
          price: {
            id: input.price.priceId,
            object: "price",
            active: true,
            billing_scheme: "per_unit",
            created: 0,
            currency: "usd",
            custom_unit_amount: null,
            livemode: false,
            lookup_key: null,
            metadata: {},
            nickname: null,
            product: "prod_contract",
            recurring: null,
            tax_behavior: "unspecified",
            tiers_mode: null,
            transform_quantity: null,
            type: "one_time",
            unit_amount: 1234,
            unit_amount_decimal: "1234",
          },
          quantity: 1,
          taxes: [],
        },
      ],
      has_more: false,
      url: "/v1/checkout/sessions/cs_test_contract/line_items",
    },
    ...changes,
  } as Stripe.Checkout.Session;
}

function providerWith(overrides: {
  create?: ReturnType<typeof vi.fn>;
  retrieve?: ReturnType<typeof vi.fn>;
  expire?: ReturnType<typeof vi.fn>;
  constructEvent?: ReturnType<typeof vi.fn>;
}) {
  const stripe = {
    checkout: {
      sessions: {
        create: overrides.create ?? vi.fn(async () => stripeSession()),
        retrieve: overrides.retrieve ?? vi.fn(async () => stripeSession()),
        expire:
          overrides.expire ??
          vi.fn(async () => stripeSession({ status: "expired", url: null })),
      },
    },
    webhooks: {
      constructEvent:
        overrides.constructEvent ??
        vi.fn(() => ({
          id: "evt_test_contract",
          type: "checkout.session.completed",
          created: 1_784_000_000,
          data: { object: { id: "cs_test_contract" } },
        })),
    },
  } as unknown as Stripe;
  return new StripeCheckoutProvider(
    "contract-key-not-used",
    "contract-webhook-marker",
    stripe,
  );
}

describe("Stripe Checkout provider contract", () => {
  it("constructs one hosted card payment with server price, URLs, and correlation only", async () => {
    const create = vi.fn(async () => stripeSession());
    const provider = providerWith({ create });
    await expect(provider.createHostedCheckout(input)).resolves.toMatchObject({
      id: "cs_test_contract",
      amountTotal: 1234,
      currency: "usd",
    });
    expect(create).toHaveBeenCalledWith(
      {
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [{ price: input.price.priceId, quantity: 1 }],
        client_reference_id: input.metadata.paymentAttemptId,
        metadata: input.metadata,
        payment_intent_data: { metadata: input.metadata },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        expires_at: Math.floor(input.expiresAt.getTime() / 1000),
        allow_promotion_codes: false,
        submit_type: "pay",
      },
      { idempotencyKey: input.idempotencyKey },
    );
    expect(JSON.stringify(create.mock.calls[0])).not.toContain("@example");
  });

  it("retrieves expanded Price evidence used by authoritative fulfillment", async () => {
    const retrieve = vi.fn(async () =>
      stripeSession({
        status: "complete",
        payment_status: "paid",
        payment_intent: "pi_test_contract",
      }),
    );
    await expect(
      providerWith({ retrieve }).retrieveCheckout("cs_test_contract"),
    ).resolves.toMatchObject({
      paymentStatus: "PAID",
      lineItems: [
        {
          priceId: input.price.priceId,
          amount: 1234,
          currency: "usd",
          quantity: 1,
        },
      ],
    });
    expect(retrieve).toHaveBeenCalledWith("cs_test_contract", {
      expand: ["line_items.data.price"],
    });
  });

  it("delegates raw-body signature verification and returns only bounded correlation", () => {
    const constructEvent = vi.fn(() => ({
      id: "evt_test_verified",
      type: "checkout.session.completed",
      created: 1_784_000_000,
      data: { object: { id: "cs_test_verified" } },
    }));
    expect(
      providerWith({ constructEvent }).verifyWebhook(
        "raw-body-is-not-persisted",
        "signature-is-not-logged",
      ),
    ).toEqual({
      id: "evt_test_verified",
      type: "checkout.session.completed",
      createdAt: new Date(1_784_000_000_000),
      checkoutSessionId: "cs_test_verified",
    });
    expect(constructEvent).toHaveBeenCalledWith(
      "raw-body-is-not-persisted",
      "signature-is-not-logged",
      "contract-webhook-marker",
    );
  });

  it("maps provider and signature failures to application-owned safe errors", async () => {
    const create = vi.fn(async () => {
      throw new Error("sensitive upstream response and raw token");
    });
    await expect(
      providerWith({ create }).createHostedCheckout(input),
    ).rejects.toMatchObject({
      code: "STRIPE_UNAVAILABLE",
      providerCode: "PROVIDER_ERROR",
      message: "Stripe Checkout is temporarily unavailable.",
    });

    const constructEvent = vi.fn(() => {
      throw new Error("signature details");
    });
    expect(() =>
      providerWith({ constructEvent }).verifyWebhook("body", "bad"),
    ).toThrowError(
      expect.objectContaining({ code: "WEBHOOK_SIGNATURE_INVALID" }),
    );
  });
});
