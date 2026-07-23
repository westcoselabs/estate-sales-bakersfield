import { redirect } from "next/navigation";

import {
  PaymentCancelRecorder,
  PaymentPanel,
} from "@/app/_components/payment-panel";
import { BuilderShell } from "@/components/shells/shells";
import { getCurrentUser } from "@/modules/auth";
import { createConfiguredEventService } from "@/modules/events";
import { createConfiguredPaymentService } from "@/modules/payments";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

interface Props {
  readonly params: Promise<{ eventId: string }>;
  readonly searchParams: Promise<{ attempt?: string }>;
}

export default async function PaymentCancelPage({
  params,
  searchParams,
}: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");
  const { eventId } = await params;
  const attemptId = (await searchParams).attempt ?? null;
  const [event, payment] = await Promise.all([
    createConfiguredEventService().get(user, eventId),
    createConfiguredPaymentService().status(user, eventId),
  ]);
  return (
    <BuilderShell
      account={{ displayName: user.displayName }}
      eyebrow="Checkout canceled"
      title={event.title ?? "Payment canceled"}
    >
      <PaymentCancelRecorder eventId={eventId} attemptId={attemptId} />
      <PaymentPanel
        eventId={eventId}
        expectedVersion={event.version}
        initialStatus={{
          ...payment,
          displayState:
            payment.displayState === "PUBLISHED"
              ? "PUBLISHED"
              : "PAYMENT_CANCELED",
          message:
            payment.displayState === "PUBLISHED"
              ? payment.message
              : "Checkout was canceled before payment confirmation.",
        }}
        returnContext="cancel"
      />
    </BuilderShell>
  );
}
