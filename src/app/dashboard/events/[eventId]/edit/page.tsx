import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/modules/auth";
import {
  createConfiguredEventService,
  EventNotFoundError,
  PUBLISHING_TERMS_VERSION,
} from "@/modules/events";
import { BuilderShell } from "@/components/shells/shells";

import { EventBuilder } from "../../../../_components/event-builder";

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
  return (
    <BuilderShell
      eyebrow={`${event.eventType === "ESTATE_SALE" ? "Estate sale" : "Yard sale"} draft`}
      title={event.title ?? "Build your event"}
      meta={
        <p>
          Draft version {event.version}. Saves use optimistic conflict
          protection.
        </p>
      }
    >
      <EventBuilder
        initialEvent={event}
        termsVersion={PUBLISHING_TERMS_VERSION}
      />
    </BuilderShell>
  );
}
