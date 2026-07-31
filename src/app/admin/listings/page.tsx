import Link from "next/link";

import { Icon } from "@/components/ui/icons";
import {
  createConfiguredAdminListingDirectory,
  listingDirectoryCriteria,
} from "@/modules/admin";
import { getCurrentUser, requireSuperAdminPrincipal } from "@/modules/auth";

function formatDate(value: Date | null) {
  return value
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeZone: "America/Los_Angeles",
      }).format(value)
    : "—";
}

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

function statusTone(value: string) {
  if (["ACTIVE", "PAID", "FULFILLED", "PUBLISHED"].includes(value)) {
    return "admin-status--success";
  }
  if (["REMOVED", "CANCELED", "DELETED_DRAFT", "FAILED"].includes(value)) {
    return "admin-status--error";
  }
  if (["BLOCKED", "MANUAL_REVIEW"].includes(value)) {
    return "admin-status--warning";
  }
  return "";
}

export default async function AdminListingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    filter?: string;
    cursor?: string;
    limit?: string;
  }>;
}) {
  const principal = requireSuperAdminPrincipal(await getCurrentUser());
  const criteria = listingDirectoryCriteria(await searchParams);
  const directory = await createConfiguredAdminListingDirectory().list(
    principal,
    criteria,
  );
  const query = new URLSearchParams();
  if (criteria.search) query.set("q", criteria.search);
  query.set("filter", criteria.filter);
  if (directory.nextCursor) query.set("cursor", directory.nextCursor);

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <div className="admin-page-header__kicker">
            <p className="eyebrow">Events and publication</p>
            <span className="admin-section-count">
              {directory.rows.length} on this page
            </span>
          </div>
          <h1>Listings</h1>
          <p>
            Inspect every retained draft, publication, and terminal lifecycle.
          </p>
        </div>
      </header>
      <section className="admin-panel admin-filter-panel">
        <form className="admin-directory-form">
          <label className="ui-field admin-search-field">
            <span className="ui-field__label">Search listings</span>
            <span className="admin-search-field__control">
              <Icon name="search" size={19} />
              <input
                className="ui-input"
                defaultValue={criteria.search}
                name="q"
                placeholder="Title, organizer, email, or exact UUID"
              />
            </span>
          </label>
          <label className="ui-field">
            <span className="ui-field__label">Filter</span>
            <select
              className="ui-input"
              defaultValue={criteria.filter}
              name="filter"
            >
              <option value="active">Active</option>
              <option value="drafts">Drafts</option>
              <option value="published">Published</option>
              <option value="ended">Ended</option>
              <option value="canceled">Canceled</option>
              <option value="deleted">Deleted drafts</option>
              <option value="removed">Admin removed</option>
            </select>
          </label>
          <button className="ui-button ui-button--primary">Apply</button>
        </form>
      </section>
      <section className="admin-panel admin-panel--table">
        <div className="admin-table-toolbar">
          <div>
            <strong>Listing directory</strong>
            <span>Ordered by latest update</span>
          </div>
          <span className="admin-section-count">
            {directory.rows.length} results
          </span>
        </div>
        {directory.rows.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <caption>{directory.rows.length} listings on this page</caption>
              <thead>
                <tr>
                  <th scope="col">Event</th>
                  <th scope="col">Organizer</th>
                  <th scope="col">Dates</th>
                  <th scope="col">Workflow / lifecycle</th>
                  <th scope="col">Payment</th>
                  <th scope="col">Publication</th>
                  <th scope="col">Photos</th>
                  <th scope="col">Created / updated</th>
                </tr>
              </thead>
              <tbody>
                {directory.rows.map((listing) => (
                  <tr key={listing.id}>
                    <td data-label="Event">
                      <Link
                        className="admin-table__primary"
                        href={`/admin/listings/${listing.id}`}
                      >
                        {listing.title}
                      </Link>
                      <br />
                      <small>{label(listing.eventType)}</small>
                    </td>
                    <td data-label="Organizer">
                      <Link href={`/admin/users/${listing.organizer.id}`}>
                        {listing.organizer.displayName}
                      </Link>
                      <br />
                      <small>{listing.organizer.email}</small>
                    </td>
                    <td data-label="Dates">
                      {formatDate(listing.startsAt)} –{" "}
                      {formatDate(listing.endsAt)}
                    </td>
                    <td data-label="Workflow / lifecycle">
                      {label(listing.workflowState)}
                      <br />
                      <span
                        className={`admin-status ${statusTone(listing.lifecycle)}`}
                      >
                        {label(listing.lifecycle)}
                      </span>
                    </td>
                    <td data-label="Payment">
                      {listing.payment ? (
                        <span
                          className={`admin-status ${statusTone(listing.payment.paymentState)}`}
                        >
                          {label(listing.payment.paymentState)}
                        </span>
                      ) : (
                        "No attempt"
                      )}
                    </td>
                    <td data-label="Publication">
                      <span
                        className={`admin-status ${statusTone(listing.publicationStatus)}`}
                      >
                        {label(listing.publicationStatus)}
                      </span>
                    </td>
                    <td data-label="Photos">
                      {listing.readyPhotoCount} READY / {listing.photoCount}{" "}
                      total
                    </td>
                    <td data-label="Created / updated">
                      {formatDate(listing.createdAt)}
                      <br />
                      {formatDate(listing.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No listings match these criteria.</p>
        )}
        <div className="admin-pagination">
          <span>Most recently updated listings appear first</span>
          {directory.nextCursor ? (
            <Link
              className="ui-button ui-button--secondary"
              href={`/admin/listings?${query}`}
            >
              Next page
            </Link>
          ) : null}
        </div>
      </section>
    </div>
  );
}
