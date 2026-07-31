import Link from "next/link";
import { redirect } from "next/navigation";

import { PaymentPanel } from "@/app/_components/payment-panel";
import { BuilderShell } from "@/components/shells/shells";
import { getCurrentUser } from "@/modules/auth";
import { createConfiguredEventService } from "@/modules/events";
import { createConfiguredPaymentService } from "@/modules/payments";

export const dynamic = "force-dynamic";

interface Props {
  readonly params: Promise<{ eventId: string }>;
}

export default async function EventPaymentPage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");
  const { eventId } = await params;
  const [event, payment] = await Promise.all([
    createConfiguredEventService().get(user, eventId),
    createConfiguredPaymentService().status(user, eventId),
  ]);
  const paymentCanBeResumed = [
    "READY_FOR_PAYMENT",
    "CHECKOUT_CREATED",
    "PAYMENT_CANCELED",
    "CHECKOUT_EXPIRED",
  ].includes(payment.displayState);
  return (
    <BuilderShell
      className="payment-page-shell"
      account={{
        displayName: user.displayName,
        isSuperAdmin: user.role === "SUPER_ADMIN",
      }}
      eyebrow={
        payment.displayState === "CANCELED"
          ? "Canceled event record"
          : payment.displayState === "PUBLISHED"
            ? "Published listing"
            : paymentCanBeResumed
              ? "Approved listing publication"
              : "Payment and publication status"
      }
      title={event.title ?? "Event payment"}
      meta={
        <div className="payment-page-meta">
          <nav aria-label="Listing publication links">
            {payment.displayState === "CANCELED" ? (
              <Link href="/dashboard/events?view=history">
                Return to event history
              </Link>
            ) : (
              <>
                <Link href={`/dashboard/events/${eventId}/edit`}>
                  Return to approved draft
                </Link>
                <Link href={`/dashboard/events/${eventId}/preview`}>
                  Review listing preview
                </Link>
              </>
            )}
          </nav>
          {payment.displayState === "CANCELED" ? (
            <p>
              This paid publication was canceled by the organizer. Its financial
              record remains and no refund was initiated.
            </p>
          ) : payment.displayState === "PUBLISHED" ? (
            <p>This listing is published and no further payment is required.</p>
          ) : paymentCanBeResumed ? (
            <p>
              Your approval is saved. You can leave this page and return to pay
              later as long as you do not edit the approved listing revision.
            </p>
          ) : (
            <p>
              Review the current payment and publication status below. Payment
              is available only for the exact approved listing revision.
            </p>
          )}
        </div>
      }
    >
      <PaymentPanel
        eventId={eventId}
        expectedVersion={event.version}
        initialStatus={payment}
      />
    </BuilderShell>
  );
}
