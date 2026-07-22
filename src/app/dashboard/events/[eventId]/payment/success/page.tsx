import Link from "next/link";
import { redirect } from "next/navigation";

import { PaymentPanel } from "@/app/_components/payment-panel";
import { getCurrentUser } from "@/modules/auth";
import { createConfiguredEventService } from "@/modules/events";
import { createConfiguredPaymentService } from "@/modules/payments";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

interface Props {
  readonly params: Promise<{ eventId: string }>;
}

export default async function PaymentSuccessPage({ params }: Props) {
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
          <Link href="/dashboard">← Dashboard</Link>
        </p>
        <p className="eyebrow">Checkout return</p>
        <h1>{event.title ?? "Payment status"}</h1>
      </header>
      <PaymentPanel
        eventId={eventId}
        expectedVersion={event.version}
        initialStatus={payment}
        returnContext="success"
      />
    </main>
  );
}
