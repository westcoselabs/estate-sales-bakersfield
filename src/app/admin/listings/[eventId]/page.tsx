import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import {
  AdminNotFoundError,
  createConfiguredAdminEventDetail,
} from "@/modules/admin";
import { getCurrentUser, requireSuperAdminPrincipal } from "@/modules/auth";

import { ModerationActions } from "./_components/moderation-actions";
import { CopyId } from "../../_components/copy-id";

function formatDate(value: Date | null | undefined) {
  return value
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Los_Angeles",
      }).format(value)
    : "—";
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

export default async function AdminListingDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const principal = requireSuperAdminPrincipal(await getCurrentUser());
  const id = z
    .string()
    .uuid()
    .safeParse((await params).eventId);
  if (!id.success) notFound();
  let event;
  try {
    event = await createConfiguredAdminEventDetail().get(principal, id.data);
  } catch (error) {
    if (error instanceof AdminNotFoundError) notFound();
    throw error;
  }

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">
            {label(event.eventType)} · {label(event.lifecycle)}
          </p>
          <h1>{event.title}</h1>
          <p>
            Organized by{" "}
            <Link href={`/admin/users/${event.organizer.id}`}>
              {event.organizer.displayName}
            </Link>
          </p>
        </div>
        <ModerationActions
          canRemove={event.capabilities.remove}
          canRestore={event.capabilities.restore}
          eventId={event.id}
          published={event.publication !== null}
          title={event.title}
          version={event.version}
        />
      </header>

      <div className="admin-actions">
        <Link
          className="ui-button ui-button--secondary"
          href={`/admin/listings/${event.id}/preview?mode=organizer`}
        >
          Organizer preview
        </Link>
        {event.publication ? (
          <Link
            className="ui-button ui-button--secondary"
            href={`/admin/listings/${event.id}/preview?mode=public`}
          >
            Public snapshot preview
          </Link>
        ) : null}
      </div>

      <section className="admin-panel" aria-labelledby="listing-identity-title">
        <header>
          <h2 id="listing-identity-title">Listing and lifecycle</h2>
        </header>
        <dl className="admin-detail-list">
          <div>
            <dt>Event ID</dt>
            <dd>
              <CopyId label="event ID" value={event.id} />
            </dd>
          </div>
          <div>
            <dt>Public ID</dt>
            <dd>{event.publicId}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{event.version}</dd>
          </div>
          <div>
            <dt>Workflow</dt>
            <dd>{label(event.workflowState)}</dd>
          </div>
          <div>
            <dt>Approval</dt>
            <dd>{label(event.approvalStatus)}</dd>
          </div>
          <div>
            <dt>Lifecycle</dt>
            <dd>{label(event.lifecycle)}</dd>
          </div>
          <div>
            <dt>Starts / ends</dt>
            <dd>
              {formatDate(event.startsAt)} – {formatDate(event.endsAt)}
            </dd>
          </div>
          <div>
            <dt>Created / updated</dt>
            <dd>
              {formatDate(event.createdAt)} / {formatDate(event.updatedAt)}
            </dd>
          </div>
          <div>
            <dt>Cancellation</dt>
            <dd>
              {event.canceledAt
                ? `${formatDate(event.canceledAt)} — ${event.cancellationReason ?? "No reason"}`
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Deletion</dt>
            <dd>{formatDate(event.deletedAt)}</dd>
          </div>
          <div>
            <dt>Admin removal</dt>
            <dd>
              {event.removedAt
                ? `${formatDate(event.removedAt)} — ${event.removalReason ?? "No reason"}`
                : "—"}
            </dd>
          </div>
        </dl>
        {event.description ? <p>{event.description}</p> : null}
      </section>

      <div className="admin-grid--two">
        <section className="admin-panel" aria-labelledby="location-title">
          <header>
            <h2 id="location-title">Location</h2>
          </header>
          {event.location ? (
            <dl className="admin-detail-list">
              <div>
                <dt>Public projection</dt>
                <dd>{event.location.publicProjection}</dd>
              </div>
              <div>
                <dt>Privacy mode</dt>
                <dd>{event.privacyMode ? label(event.privacyMode) : "—"}</dd>
              </div>
              <div>
                <dt>Full address</dt>
                <dd>
                  {event.location.addressLine1}
                  {event.location.addressLine2
                    ? `, ${event.location.addressLine2}`
                    : ""}
                  , {event.location.city}, {event.location.region}{" "}
                  {event.location.postalCode}
                </dd>
              </div>
              <div>
                <dt>Confirmation</dt>
                <dd>{label(event.location.confirmationStatus)}</dd>
              </div>
            </dl>
          ) : (
            <p>No location record.</p>
          )}
        </section>
        <section className="admin-panel" aria-labelledby="publication-title">
          <header>
            <h2 id="publication-title">Publication truth</h2>
          </header>
          {event.publication ? (
            <dl className="admin-detail-list">
              <div>
                <dt>Publication ID</dt>
                <dd>
                  <CopyId label="publication ID" value={event.publication.id} />
                </dd>
              </div>
              <div>
                <dt>Payment attempt</dt>
                <dd>
                  <CopyId
                    label="payment attempt ID"
                    value={event.publication.paymentAttemptId}
                  />
                </dd>
              </div>
              <div>
                <dt>Published</dt>
                <dd>{formatDate(event.publication.publishedAt)}</dd>
              </div>
              <div>
                <dt>Canonical path</dt>
                <dd>{event.publication.canonicalPath}</dd>
              </div>
              <div>
                <dt>Snapshot</dt>
                <dd>
                  {event.publication.snapshot
                    ? "Valid immutable snapshot"
                    : "Invalid snapshot"}
                </dd>
              </div>
            </dl>
          ) : (
            <p>This listing has never been published.</p>
          )}
        </section>
      </div>

      <section className="admin-panel" aria-labelledby="photos-title">
        <header>
          <h2 id="photos-title">Photos ({event.photos.length})</h2>
        </header>
        {event.photos.length ? (
          <ul className="admin-photo-grid">
            {event.photos.map((photo) => (
              <li key={photo.id}>
                {photo.previewUrl ? (
                  <Image
                    alt={`Listing photo ${photo.sortOrder + 1}`}
                    height={180}
                    src={photo.previewUrl}
                    unoptimized
                    width={240}
                  />
                ) : (
                  <div className="admin-photo-placeholder">No preview</div>
                )}
                <strong>{photo.status}</strong>
                <small>{photo.id}</small>
                {photo.processingMessage ? (
                  <span>{photo.processingMessage}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>No photos retained.</p>
        )}
      </section>

      <section className="admin-panel" aria-labelledby="listing-payments-title">
        <header>
          <h2 id="listing-payments-title">Payment attempts</h2>
        </header>
        {event.payments.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <caption>
                Internal payment history; provider identifiers are excluded
              </caption>
              <thead>
                <tr>
                  <th scope="col">Attempt ID</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Checkout</th>
                  <th scope="col">Payment</th>
                  <th scope="col">Fulfillment</th>
                  <th scope="col">Paid / fulfilled</th>
                </tr>
              </thead>
              <tbody>
                {event.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td data-label="Attempt ID">
                      <CopyId label="payment attempt ID" value={payment.id} />
                    </td>
                    <td data-label="Amount">
                      {money(payment.expectedAmount, payment.expectedCurrency)}
                    </td>
                    <td data-label="Checkout">
                      {label(payment.checkoutState)}
                    </td>
                    <td data-label="Payment">{label(payment.paymentState)}</td>
                    <td data-label="Fulfillment">
                      {label(payment.fulfillmentState)}
                    </td>
                    <td data-label="Paid / fulfilled">
                      {formatDate(payment.paidAt)} /{" "}
                      {formatDate(payment.fulfilledAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No payment attempts.</p>
        )}
      </section>

      {event.lifecycle !== "ACTIVE" ? (
        <section className="admin-panel" aria-labelledby="purge-status-title">
          <header>
            <h2 id="purge-status-title">Sanitized media-purge status</h2>
          </header>
          {event.purge ? (
            <p>
              {label(event.purge.status)} · {event.purge.attempts} attempts ·
              updated {formatDate(event.purge.updatedAt)}
            </p>
          ) : (
            <p>No media-purge job is associated with this record.</p>
          )}
        </section>
      ) : null}

      <section className="admin-panel" aria-labelledby="listing-audit-title">
        <header>
          <h2 id="listing-audit-title">Essential audit timeline</h2>
        </header>
        {event.audit.length ? (
          <ol className="admin-activity-list">
            {event.audit.map((entry) => (
              <li key={entry.id}>
                <span>
                  <strong>{label(entry.action)}</strong>
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
          <p>No allowlisted event audit entries.</p>
        )}
      </section>
    </div>
  );
}
