import Link from "next/link";
import { redirect } from "next/navigation";

import { PublicEventListing } from "@/app/_components/public-event-listing";
import { BuilderShell } from "@/components/shells/shells";
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

  if (!editor.readiness.ready) {
    return (
      <BuilderShell
        account={{ displayName: user.displayName }}
        eyebrow="Listing preview"
        title="Preview is not ready"
        backHref={`/dashboard/events/${eventId}/edit`}
        backLabel="Return to editor"
      >
        <section>
          <p>Complete these server-validated requirements:</p>
          <ul>
            {editor.readiness.missing.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
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
    projection: preview,
  };

  return (
    <BuilderShell
      account={{ displayName: user.displayName }}
      eyebrow="Exact future listing preview"
      title={preview.title}
      backHref={`/dashboard/events/${eventId}/edit`}
      backLabel="Return to editor"
      className="builder-app--listing-preview"
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
            <Link className="button-link" href={editor.publication.canonicalPath}>
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
      <PublicEventListing
        listing={previewListing}
        revisionNote={`Exact future listing preview for revision ${String(editor.contentRevision)}.`}
      />
    </BuilderShell>
  );
}
