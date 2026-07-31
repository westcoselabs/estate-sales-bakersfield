"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/ui/icons";
import { Button } from "@/components/ui/primitives";
import type { PaymentStatusDto } from "@/modules/payments";

interface PaymentPanelProps {
  readonly eventId: string;
  readonly expectedVersion: number;
  readonly initialStatus: PaymentStatusDto;
  readonly returnContext?: "success" | "cancel" | undefined;
}

const POLLING_STATES = new Set<PaymentStatusDto["displayState"]>([
  "CHECKOUT_CREATED",
  "PAYMENT_PENDING",
  "PAYMENT_RECEIVED_PUBLISHING",
  "FULFILLMENT_RETRYING",
]);

function stateTitle(state: PaymentStatusDto["displayState"]): string {
  return {
    DRAFT_INCOMPLETE: "Draft incomplete",
    READY_FOR_REVIEW: "Ready for review",
    APPROVED: "Approved",
    READY_FOR_PAYMENT: "Ready for payment",
    CHECKOUT_CREATED: "Checkout ready",
    PAYMENT_PENDING: "Payment pending",
    PAYMENT_RECEIVED_PUBLISHING: "Publishing",
    PUBLISHED: "Published",
    CANCELED: "Canceled",
    PAYMENT_CANCELED: "Payment canceled",
    CHECKOUT_EXPIRED: "Checkout expired",
    PAID_PUBLICATION_BLOCKED: "Publication needs attention",
    FULFILLMENT_RETRYING: "Publication retrying",
    MANUAL_REVIEW_REQUIRED: "Manual review required",
  }[state];
}

function stateTone(
  state: PaymentStatusDto["displayState"],
): "neutral" | "info" | "success" | "warning" | "error" {
  if (state === "PUBLISHED") return "success";
  if (state === "CANCELED") return "warning";
  if (
    state === "PAID_PUBLICATION_BLOCKED" ||
    state === "MANUAL_REVIEW_REQUIRED"
  ) {
    return "error";
  }
  if (
    state === "PAYMENT_CANCELED" ||
    state === "CHECKOUT_EXPIRED" ||
    state === "FULFILLMENT_RETRYING"
  ) {
    return "warning";
  }
  if (
    state === "CHECKOUT_CREATED" ||
    state === "PAYMENT_PENDING" ||
    state === "PAYMENT_RECEIVED_PUBLISHING"
  ) {
    return "info";
  }
  return "neutral";
}

export function PaymentPanel({
  eventId,
  expectedVersion,
  initialStatus,
  returnContext,
}: PaymentPanelProps) {
  const [status, setStatus] = useState(initialStatus);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const priceLabel = useMemo(() => {
    if (!status.price) return null;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: status.price.currency,
    }).format(status.price.amount / 100);
  }, [status.price]);

  useEffect(() => {
    if (!POLLING_STATES.has(status.displayState)) return;
    const timer = window.setInterval(() => {
      void fetch(`/api/events/${eventId}/payment-status`, {
        credentials: "same-origin",
        cache: "no-store",
      })
        .then(async (response) => {
          if (!response.ok) return;
          const payload = (await response.json()) as {
            payment: PaymentStatusDto;
          };
          setStatus(payload.payment);
        })
        .catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [eventId, status.displayState]);

  async function beginCheckout() {
    setBusy(true);
    setMessage(null);
    let checkoutUrl: string | null = null;
    try {
      const response = await fetch(`/api/events/${eventId}/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ expectedVersion }),
      });
      const payload = (await response.json()) as {
        checkout?: { checkoutUrl: string };
        error?: string;
      };
      if (!response.ok || !payload.checkout) {
        setMessage(payload.error ?? "Checkout could not be created.");
        return;
      }
      checkoutUrl = payload.checkout.checkoutUrl;
    } catch {
      setMessage("Checkout is temporarily unavailable.");
    } finally {
      setBusy(false);
    }
    if (!checkoutUrl) return;
    try {
      window.location.assign(checkoutUrl);
    } catch {
      setMessage(
        "Checkout was created, but this browser could not open it. Reload and try again.",
      );
    }
  }

  const canPay = [
    "READY_FOR_PAYMENT",
    "CHECKOUT_CREATED",
    "CHECKOUT_EXPIRED",
    "PAYMENT_CANCELED",
  ].includes(status.displayState);
  const checkoutAction =
    status.displayState === "CHECKOUT_CREATED"
      ? "Continue to Checkout"
      : status.displayState === "CHECKOUT_EXPIRED" ||
          status.displayState === "PAYMENT_CANCELED"
        ? "Try payment again"
        : "Pay and publish";
  const fixturePrice = Boolean(status.price?.fixture);
  const tone = stateTone(status.displayState);
  const panelTitle =
    status.displayState === "CANCELED"
      ? "Canceled event record"
      : status.displayState === "PUBLISHED"
        ? "Your listing is live"
        : canPay
          ? "Finish publishing your listing"
          : "Publication status";

  return (
    <section className="payment-panel" aria-labelledby="payment-panel-title">
      <div className="payment-panel__main">
        <div className="payment-panel__state-heading">
          <span className={`payment-state payment-state--${tone}`}>
            <Icon
              name={
                tone === "success"
                  ? "check"
                  : tone === "warning" || tone === "error"
                    ? "warning"
                    : "status"
              }
              size={18}
            />
            {stateTitle(status.displayState)}
          </span>
          <div>
            <p className="eyebrow">Payment and publication</p>
            <h2 id="payment-panel-title">{panelTitle}</h2>
          </div>
        </div>
        <p className="payment-panel__status" aria-live="polite">
          {status.message}
        </p>
        {returnContext === "success" && status.displayState !== "PUBLISHED" ? (
          <p className="payment-panel__notice payment-panel__notice--info">
            <Icon name="clock" size={19} />
            <span>
              Your return from Checkout is not proof of payment. This page is
              waiting for the signed webhook and internal fulfillment state.
            </span>
          </p>
        ) : null}
        {returnContext === "cancel" ? (
          <p className="payment-panel__notice payment-panel__notice--warning">
            <Icon name="warning" size={19} />
            <span>No publication occurs from a canceled Checkout return.</span>
          </p>
        ) : null}
        <dl className="payment-summary">
          <div>
            <dt>
              {fixturePrice ? "Test checkout amount" : "Listing publication"}
            </dt>
            <dd>{priceLabel ?? "Not configured"}</dd>
          </div>
          <div>
            <dt>Payment</dt>
            <dd>One time</dd>
          </div>
          <div>
            <dt>Publishes</dt>
            <dd>This approved revision</dd>
          </div>
        </dl>
        {fixturePrice ? (
          <p className="payment-panel__notice payment-panel__notice--warning">
            <Icon name="info" size={19} />
            <span>
              Local test mode is active. {priceLabel} is a fixture amount, not
              the public listing fee.
            </span>
          </p>
        ) : null}
        {!priceLabel ? (
          <p className="payment-panel__notice payment-panel__notice--error">
            <Icon name="warning" size={19} />
            <span>
              Publication pricing and Stripe Checkout still need server
              configuration.
            </span>
          </p>
        ) : null}
        {message ? (
          <p
            className="payment-panel__notice payment-panel__notice--error"
            role="alert"
          >
            <Icon name="warning" size={19} />
            <span>{message}</span>
          </p>
        ) : null}
      </div>
      <aside className="payment-actions" aria-label="Checkout actions">
        <div className="payment-actions__secure">
          <Icon name="shield" size={22} />
          <div>
            <strong>
              {fixturePrice ? "Safe local test" : "Secure checkout"}
            </strong>
            <p>
              {fixturePrice
                ? "No card is charged in local test mode."
                : "Card details are handled by Stripe."}
            </p>
          </div>
        </div>
        {canPay ? (
          <Button
            type="button"
            onClick={() => void beginCheckout()}
            disabled={busy || !status.price}
            loading={busy}
            className="payment-actions__primary"
          >
            {busy ? "Opening checkout" : checkoutAction}
          </Button>
        ) : null}
        {status.canonicalPath && status.displayState !== "CANCELED" ? (
          <Link className="button-link" href={status.canonicalPath}>
            View live listing
          </Link>
        ) : null}
        {canPay && !fixturePrice ? (
          <p className="payment-actions__fine-print">
            You will continue to Stripe to complete payment. Your listing is
            published only after payment is confirmed.
          </p>
        ) : null}
        {status.recoverable ? (
          <p className="payment-actions__fine-print">
            Recovery is queued automatically. Support can safely rerun the same
            payment reconciliation without another charge.
          </p>
        ) : null}
      </aside>
    </section>
  );
}

export function PaymentCancelRecorder({
  eventId,
  attemptId,
}: {
  readonly eventId: string;
  readonly attemptId: string | null;
}) {
  useEffect(() => {
    if (!attemptId) return;
    void fetch(`/api/events/${eventId}/payment-cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ attemptId }),
    }).catch(() => undefined);
  }, [attemptId, eventId]);
  return null;
}
