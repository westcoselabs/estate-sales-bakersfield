import { notFound } from "next/navigation";

import { getConfiguredFakeCheckout } from "@/modules/payments";
import { getServerEnvironment } from "@/platform/config/env";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

interface Props {
  readonly params: Promise<{ sessionId: string }>;
}

export default async function TestCheckoutPage({ params }: Props) {
  if (!["local", "test"].includes(getServerEnvironment().APP_ENV)) notFound();
  const { sessionId } = await params;
  const checkout = (() => {
    try {
      return getConfiguredFakeCheckout(sessionId);
    } catch {
      notFound();
    }
  })();
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: checkout.session.currency ?? "usd",
  }).format((checkout.session.amountTotal ?? 0) / 100);
  return (
    <main>
      <section className="dashboard-panel">
        <p className="eyebrow">Deterministic Test Checkout</p>
        <h1>Listing publication payment</h1>
        <p>
          This local/Test fixture simulates Stripe-hosted Checkout without card
          entry or network access.
        </p>
        <p>
          <strong>{amount}</strong> · immediate test payment
        </p>
        <div className="checkout-actions">
          <form
            method="post"
            action={`/api/test-stripe/sessions/${sessionId}/complete`}
          >
            <button type="submit">Complete test payment</button>
          </form>
          <form
            method="post"
            action={`/api/test-stripe/sessions/${sessionId}/cancel`}
          >
            <button className="secondary-button" type="submit">
              Cancel
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
