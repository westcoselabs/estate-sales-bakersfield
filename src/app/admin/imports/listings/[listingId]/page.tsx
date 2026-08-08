import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { getCurrentUser, requireSuperAdminPrincipal } from "@/modules/auth";
import { createConfiguredListingImportAdminQueryService } from "@/modules/listing-imports";

import { CopyId } from "../../../_components/copy-id";
import { ExternalListingActions } from "../../_components/external-listing-actions";
import { ExternalListingEditor } from "../../_components/external-listing-editor";
import { ImportStatus, importLabel } from "../../_components/import-status";

function formatDate(value: Date | null): string {
  return value
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Los_Angeles",
      }).format(value)
    : "—";
}

function sourceHost(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return "Original source";
  }
}

export default async function ExternalListingAdminPage({
  params,
}: {
  params: Promise<{ listingId: string }>;
}) {
  const principal = requireSuperAdminPrincipal(await getCurrentUser());
  const parsedId = z
    .string()
    .uuid()
    .safeParse((await params).listingId);
  if (!parsedId.success) notFound();
  const listing =
    await createConfiguredListingImportAdminQueryService().externalListingDetail(
      principal,
      parsedId.data,
    );
  if (!listing) notFound();

  const editable = listing.status === "PUBLISHED";
  const supportedPrivacy = listing.privacyMode !== "HIDDEN_UNTIL_START";

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">
            Unclaimed · {listing.provenance.source.name}
          </p>
          <h1>{listing.title}</h1>
          <p>
            Published {formatDate(listing.publishedAt)} · version{" "}
            {listing.version}
          </p>
        </div>
        <ImportStatus value={listing.status} />
      </header>

      <div className="admin-actions">
        <Link
          className="ui-button ui-button--secondary"
          href="/admin/imports?view=listings"
        >
          Back to published listings
        </Link>
        <Link
          className="ui-button ui-button--secondary"
          href={`/admin/imports/candidates/${listing.candidateId}`}
        >
          Open source candidate
        </Link>
      </div>

      {!supportedPrivacy ? (
        <p className="ui-alert ui-alert--warning">
          This retained listing uses a privacy mode that cannot be edited by the
          Listing Imports v1 review form.
        </p>
      ) : null}

      <ExternalListingEditor
        content={{
          eventType: listing.eventType,
          title: listing.title,
          description: listing.description,
          localStartsAt: listing.localStartsAt,
          localEndsAt: listing.localEndsAt,
          timezone: listing.timezone,
          privacyMode:
            listing.privacyMode === "EXACT_ADDRESS"
              ? "EXACT_ADDRESS"
              : "APPROXIMATE_LOCATION",
        }}
        disabled={!editable || !supportedPrivacy}
        listingId={listing.id}
        version={listing.version}
      />

      <section
        className="admin-panel"
        aria-labelledby="external-identity-title"
      >
        <header>
          <h2 id="external-identity-title">Publication and provenance</h2>
        </header>
        <dl className="admin-detail-list">
          <div>
            <dt>Listing ID</dt>
            <dd>
              <CopyId label="external listing ID" value={listing.id} />
            </dd>
          </div>
          <div>
            <dt>Public ID</dt>
            <dd>{listing.publicId}</dd>
          </div>
          <div>
            <dt>Canonical path</dt>
            <dd>
              <code>{listing.canonicalPath}</code>
            </dd>
          </div>
          <div>
            <dt>Sale type</dt>
            <dd>{importLabel(listing.eventType)}</dd>
          </div>
          <div>
            <dt>Schedule</dt>
            <dd>
              {formatDate(listing.startsAt)} / {formatDate(listing.endsAt)}
            </dd>
          </div>
          <div>
            <dt>Privacy</dt>
            <dd>{importLabel(listing.privacyMode)}</dd>
          </div>
          <div>
            <dt>Source listing ID</dt>
            <dd>{listing.provenance.sourceListingId}</dd>
          </div>
          <div>
            <dt>Original source</dt>
            <dd>
              <a
                href={listing.provenance.canonicalSourceUrl}
                rel="noreferrer"
                target="_blank"
              >
                {sourceHost(listing.provenance.canonicalSourceUrl)}
              </a>
            </dd>
          </div>
          <div>
            <dt>First / last seen</dt>
            <dd>
              {formatDate(listing.provenance.firstSeenAt)} /{" "}
              {formatDate(listing.provenance.lastSeenAt)}
            </dd>
          </div>
          <div>
            <dt>Expired</dt>
            <dd>{formatDate(listing.expiredAt)}</dd>
          </div>
          <div>
            <dt>Removed</dt>
            <dd>{formatDate(listing.removedAt)}</dd>
          </div>
        </dl>
        {listing.removalReason ? (
          <p>
            <strong>Removal reason:</strong> {listing.removalReason}
          </p>
        ) : null}
      </section>

      <section
        className="admin-panel"
        aria-labelledby="external-location-title"
      >
        <header>
          <h2 id="external-location-title">Confirmed location</h2>
        </header>
        {listing.location ? (
          <dl className="admin-detail-list">
            <div>
              <dt>Address</dt>
              <dd>
                {listing.location.addressLine1}
                {listing.location.addressLine2
                  ? `, ${listing.location.addressLine2}`
                  : ""}
                , {listing.location.city}, {listing.location.region}{" "}
                {listing.location.postalCode}
              </dd>
            </div>
            <div>
              <dt>Timezone</dt>
              <dd>{listing.location.timezone}</dd>
            </div>
            <div>
              <dt>Confirmation</dt>
              <dd>
                <ImportStatus value={listing.location.confirmationStatus} />
              </dd>
            </div>
            <div>
              <dt>Resolution source</dt>
              <dd>{importLabel(listing.location.resolutionSource)}</dd>
            </div>
            <div>
              <dt>Public zone</dt>
              <dd>{listing.location.publicZone}</dd>
            </div>
            <div>
              <dt>Validation</dt>
              <dd>{importLabel(listing.location.validationStatus)}</dd>
            </div>
          </dl>
        ) : (
          <p>No external-listing location is retained.</p>
        )}
      </section>

      <section className="admin-panel" aria-labelledby="external-actions-title">
        <header>
          <h2 id="external-actions-title">Lifecycle</h2>
        </header>
        <p>
          Removal is immediate and terminal. Imported provenance and audit
          history remain retained.
        </p>
        <ExternalListingActions
          canRemove={listing.status === "PUBLISHED"}
          listingId={listing.id}
          title={listing.title}
          version={listing.version}
        />
      </section>

      <section className="admin-panel" aria-labelledby="external-audit-title">
        <header>
          <h2 id="external-audit-title">Audit timeline</h2>
        </header>
        {listing.audit.length ? (
          <ol className="admin-activity-list">
            {listing.audit.map((entry) => (
              <li key={entry.id}>
                <span>
                  <strong>{importLabel(entry.action)}</strong>
                  <time dateTime={entry.occurredAt.toISOString()}>
                    {formatDate(entry.occurredAt)}
                  </time>
                  {entry.requestId ? (
                    <CopyId label="request ID" value={entry.requestId} />
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p>No allowlisted external-listing audit entries.</p>
        )}
        {listing.auditTruncated ? (
          <p>
            <small>Only the newest audit entries are shown.</small>
          </p>
        ) : null}
      </section>
    </div>
  );
}
