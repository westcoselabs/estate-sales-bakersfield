import Link from "next/link";
import { redirect } from "next/navigation";

import { PaymentPanel } from "@/app/_components/payment-panel";
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
  return (
    <main className="builder-shell">
      <header className="builder-header">
        <p>
          <Link href={`/dashboard/events/${eventId}/preview`}>
            ← Return to preview
          </Link>
        </p>
        <p className="eyebrow">Approved listing publication</p>
        <h1>{event.title ?? "Event payment"}</h1>
      </header>
      <PaymentPanel
        eventId={eventId}
        expectedVersion={event.version}
        initialStatus={payment}
      />
    </main>
  );
}
