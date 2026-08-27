import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/modules/auth";
import {
  createConfiguredEventService,
  EventNotFoundError,
  PUBLISHING_TERMS_VERSION,
} from "@/modules/events";
import { createConfiguredPaymentService } from "@/modules/payments";
import { BuilderShell } from "@/components/shells/shells";

import { EventBuilder } from "../../../../_components/event-builder";
import { EventLifecycleAction } from "../../../_components/event-lifecycle-action";

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
  const deletionBlocked = [
    "PAYMENT_PENDING",
    "PAYMENT_RECEIVED_PUBLISHING",
    "PAID_PUBLICATION_BLOCKED",
    "FULFILLMENT_RETRYING",
    "MANUAL_REVIEW_REQUIRED",
  ].includes(payment.displayState)
    ? "Deletion is unavailable while payment or publication is being processed."
    : undefined;
  return (
    <BuilderShell
      account={{
        displayName: user.displayName,
        isSuperAdmin: user.role === "SUPER_ADMIN",
      }}
      eyebrow={`${event.eventType === "ESTATE_SALE" ? "Estate sale" : "Yard sale"} draft`}
      title={event.title ?? "Build your event"}
    >
      <EventBuilder
        initialEvent={event}
        termsVersion={PUBLISHING_TERMS_VERSION}
        accountEmail={user.email}
        initialEmailVerified={Boolean(user.emailVerifiedAt)}
      />
      {payment.displayState !== "CANCELED" ? (
        <details className="builder-danger-zone-region">
          <summary className="builder-danger-zone-summary">
            <span>
              <span className="eyebrow">Danger zone</span>
              <strong>
                {payment.displayState === "PUBLISHED"
                  ? "Cancel or remove this listing"
                  : "Delete this draft"}
              </strong>
            </span>
          </summary>
          <EventLifecycleAction
            eventId={event.id}
            title={event.title}
            expectedVersion={event.version}
            kind={payment.displayState === "PUBLISHED" ? "cancel" : "delete"}
            variant="danger-zone"
            disabledReason={deletionBlocked}
          />
        </details>
      ) : null}
    </BuilderShell>
  );
}
