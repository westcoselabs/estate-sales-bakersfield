"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
    CHECKOUT_CREATED: "Checkout created",
    PAYMENT_PENDING: "Payment pending",
    PAYMENT_RECEIVED_PUBLISHING: "Payment received; publishing",
    PUBLISHED: "Published",
    PAYMENT_CANCELED: "Payment canceled",
    CHECKOUT_EXPIRED: "Checkout expired",
    PAID_PUBLICATION_BLOCKED: "Paid; publication blocked",
    FULFILLMENT_RETRYING: "Fulfillment retrying",
    MANUAL_REVIEW_REQUIRED: "Manual review required",
  }[state];
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
      window.location.assign(payload.checkout.checkoutUrl);
    } catch {
      setMessage("Checkout is temporarily unavailable.");
    } finally {
      setBusy(false);
    }
  }

  const canPay = [
    "READY_FOR_PAYMENT",
    "CHECKOUT_EXPIRED",
    "PAYMENT_CANCELED",
  ].includes(status.displayState);
  return (
    <section className="payment-panel" aria-live="polite">
      <div>
        <p className="eyebrow">Payment and publication</p>
        <h2>{stateTitle(status.displayState)}</h2>
        <p>{status.message}</p>
        {returnContext === "success" && status.displayState !== "PUBLISHED" ? (
          <p>
            Your return from Checkout is not proof of payment. This page is
            waiting for the signed webhook and internal fulfillment state.
          </p>
        ) : null}
        {returnContext === "cancel" ? (
          <p>No publication occurs from a canceled Checkout return.</p>
        ) : null}
        {priceLabel ? (
          <p>
            Publication price: <strong>{priceLabel}</strong>
            {status.price?.fixture ? " (Local/Test fixture)" : ""}
          </p>
        ) : (
          <p>Preview publication pricing still needs server configuration.</p>
        )}
        {message ? <p className="form-message">{message}</p> : null}
      </div>
      <div className="payment-actions">
        {canPay ? (
          <button
            type="button"
            onClick={() => void beginCheckout()}
            disabled={busy || !status.price}
          >
            {busy ? "Opening Checkout…" : "Pay and publish"}
          </button>
        ) : null}
        {status.canonicalPath ? (
          <Link className="button-link" href={status.canonicalPath}>
            View live listing
          </Link>
        ) : null}
        {status.recoverable ? (
          <p>
            Recovery is queued automatically. Support can safely rerun the same
            payment reconciliation without another charge.
          </p>
        ) : null}
      </div>
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
