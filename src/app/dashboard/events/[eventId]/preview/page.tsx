import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/modules/auth";
import { createConfiguredEventService } from "@/modules/events";
import { BuilderShell } from "@/components/shells/shells";

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
  const dateFormat = new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: preview.timezone,
  });

  return (
    <BuilderShell
      eyebrow="Exact future listing preview"
      title={preview.title}
      backHref={`/dashboard/events/${eventId}/edit`}
      backLabel="Return to editor"
      meta={<p>Revision {editor.contentRevision}</p>}
    >
      <div className="preview-toolbar">
        <strong>
          Exact future listing preview · revision {editor.contentRevision}
        </strong>
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
      <article className="listing-preview">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="listing-cover" src={preview.coverPhotoUrl} alt="" />
        <div className="listing-content">
          <p className="eyebrow">
            {preview.eventType === "ESTATE_SALE" ? "Estate sale" : "Yard sale"}
          </p>
          <h2>{preview.title}</h2>
          <p className="listing-date">
            {dateFormat.format(new Date(preview.startsAt))} –{" "}
            {dateFormat.format(new Date(preview.endsAt))}
          </p>
          <h2>Location</h2>
          {preview.address.kind === "EXACT" ? (
            <address>
              {preview.address.addressLine1}
              {preview.address.addressLine2 ? (
                <>, {preview.address.addressLine2}</>
              ) : null}
              <br />
              {preview.address.city}, {preview.address.region}{" "}
              {preview.address.postalCode}
            </address>
          ) : preview.address.kind === "APPROXIMATE" ? (
            <p>{preview.address.label}. The exact address is private.</p>
          ) : (
            <p>
              Exact address hidden until event start (
              {dateFormat.format(new Date(preview.address.releasesAt))}).
            </p>
          )}
          <h2>About this sale</h2>
          <p className="preserve-lines">{preview.description}</p>
          <h2>Hosted by</h2>
          <p>
            {preview.organizer.displayName}
            {preview.organizer.websiteUrl ? (
              <>
                {" · "}
                <a
                  href={preview.organizer.websiteUrl}
                  rel="noopener noreferrer nofollow"
                >
                  Organizer website
                </a>
              </>
            ) : null}
          </p>
          <h2>Gallery</h2>
          <div className="listing-gallery">
            {preview.gallery.map((photo, index) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={photo.id}
                src={photo.url}
                alt={`Sale item ${index + 1}`}
              />
            ))}
          </div>
          <p className="future-path">Future public URL: {preview.path}</p>
        </div>
      </article>
    </BuilderShell>
  );
}
