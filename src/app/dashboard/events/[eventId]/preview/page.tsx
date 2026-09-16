import Link from "next/link";
import { redirect } from "next/navigation";

import { PublicEventListing } from "@/app/_components/public-event-listing";
import { EventReadinessNotice } from "@/app/_components/event-readiness-notice";
import { BuilderShell, PublicFooter } from "@/components/shells/shells";
import { getCurrentUser } from "@/modules/auth";
import { createConfiguredEventService } from "@/modules/events";
import type { PublishedListing } from "@/modules/payments";

export const dynamic = "force-dynamic";
export const metadata = { referrer: "no-referrer" };

interface Props {
  readonly params: Promise<{ eventId: string }>;
}

export default async function EventPreviewPage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");
  const { eventId } = await params;
  const service = createConfiguredEventService();
  const editor = await service.get(user, eventId);
  const account = {
    displayName: user.displayName,
    isSuperAdmin: user.role === "SUPER_ADMIN",
  };

  if (!editor.readiness.ready) {
    return (
      <BuilderShell
        account={account}
        eyebrow="Listing preview"
        title="Preview is not ready"
        backHref={`/dashboard/events/${eventId}/edit`}
        backLabel="Return to editor"
      >
        <section>
          <p>Complete these details to preview your listing.</p>
          <EventReadinessNotice
            eventId={eventId}
            missing={editor.readiness.missing}
          />
        </section>
      </BuilderShell>
    );
  }

  const preview = await service.preview(user, eventId);
  const previewListing: PublishedListing = {
    eventId,
    approvedRevision: editor.contentRevision,
    canonicalPath: preview.path,
    publishedAt: new Date(),
    verifiedEmail: preview.organizer.contactEmail,
    projection: preview,
  };

  return (
    <BuilderShell
      account={account}
      eyebrow="Exact future listing preview"
      title={preview.title}
      backHref={`/dashboard/events/${eventId}/edit`}
      backLabel="Return to editor"
      className="builder-app--listing-preview"
      footer={<PublicFooter />}
      meta={<p>Revision {editor.contentRevision}</p>}
    >
      <div className="preview-toolbar listing-preview-toolbar">
        <Link
          className="button-link listing-preview-toolbar__exit"
          href={`/dashboard/events/${eventId}/edit`}
        >
          Exit preview
        </Link>
        <strong>Previewing revision {editor.contentRevision}</strong>
        <div className="listing-preview-toolbar__actions">
          {editor.publication ? (
            <Link
              className="button-link"
              href={editor.publication.canonicalPath}
            >
              View live listing
            </Link>
          ) : editor.approvalStatus === "APPROVED" &&
            editor.approvedRevision === editor.contentRevision ? (
            <Link
              className="button-link"
              href={`/dashboard/events/${eventId}/payment`}
            >
              Make payment
            </Link>
          ) : null}
        </div>
      </div>
      {preview.address.kind === "EXACT" &&
      editor.privacyMode === "HIDDEN_UNTIL_START" ? (
        <p className="notice">
          You are reviewing the exact address that will be released to the
          public on{" "}
          {new Intl.DateTimeFormat("en-US", {
            dateStyle: "full",
            timeStyle: "short",
            timeZone: editor.timezone ?? "America/Los_Angeles",
          }).format(
            new Date(
              editor.addressRevealAt ?? editor.startsAt ?? preview.startsAt,
            ),
          )}
          . Visitors will see an approximate area before then.
        </p>
      ) : null}
      <PublicEventListing
        listing={previewListing}
        revisionNote={`Exact future listing preview for revision ${String(editor.contentRevision)}.`}
      />
    </BuilderShell>
  );
}
