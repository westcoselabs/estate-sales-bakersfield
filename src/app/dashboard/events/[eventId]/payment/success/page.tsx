import { redirect } from "next/navigation";

import { PaymentPanel } from "@/app/_components/payment-panel";
import { BuilderShell } from "@/components/shells/shells";
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
    <BuilderShell
      eyebrow="Checkout return"
      title={event.title ?? "Payment status"}
    >
      <PaymentPanel
        eventId={eventId}
        expectedVersion={event.version}
        initialStatus={payment}
        returnContext="success"
      />
    </BuilderShell>
  );
}
