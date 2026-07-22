import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/modules/auth";
import {
  createConfiguredEventService,
  EventNotFoundError,
  PUBLISHING_TERMS_VERSION,
} from "@/modules/events";

import { EventBuilder } from "../../../../_components/event-builder";
import { PaymentPanel } from "../../../../_components/payment-panel";
import { createConfiguredPaymentService } from "@/modules/payments";

export const dynamic = "force-dynamic";

interface Props {
  readonly params: Promise<{ eventId: string }>;
}

export default async function EventEditPage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");
  const { eventId } = await params;
  const event = await createConfiguredEventService()
    .get(user, eventId)
    .catch((error: unknown) => {
      if (error instanceof EventNotFoundError) notFound();
      throw error;
    });
  const payment = await createConfiguredPaymentService().status(user, eventId);
  return (
    <main className="builder-shell">
      <header className="builder-header">
        <p>
          <Link href="/dashboard">← Back to dashboard</Link>
        </p>
        <p className="eyebrow">
          {event.eventType === "ESTATE_SALE" ? "Estate sale" : "Yard sale"}{" "}
          draft
        </p>
        <h1>{event.title ?? "Build your event"}</h1>
        <p>
          Draft version {event.version}. Saves use optimistic conflict
          protection.
        </p>
      </header>
      <EventBuilder
        initialEvent={event}
        termsVersion={PUBLISHING_TERMS_VERSION}
      />
      <PaymentPanel
        eventId={eventId}
        expectedVersion={event.version}
        initialStatus={payment}
      />
    </main>
  );
}
