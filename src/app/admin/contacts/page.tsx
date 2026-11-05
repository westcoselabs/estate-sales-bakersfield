import Link from "next/link";
import "./contacts.css";
import { requireAdminPageSession } from "@/modules/auth";
import { createContactDirectory } from "@/modules/contacts";
import {
  ContactExport,
  ContactImport,
  ContactUnsubscribe,
} from "./_components/contact-actions";

const categoryLabel = (category: string) =>
  category === "ATTENDEE" ? "Estate Sale Attendees" : "Business Owners";
const statusLabel = (status: string) =>
  status === "CLEANED"
    ? "Cleaned / undeliverable"
    : status === "UNSUBSCRIBED"
      ? "Unsubscribed"
      : "Subscribed";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdminPageSession();
  const directory = await createContactDirectory().list(
    session,
    await searchParams,
  );
  const { filters } = directory;
  const pageLink = (page: number) => {
    const params = new URLSearchParams();
    Object.entries({ ...filters, page }).forEach(([key, value]) => {
      if (value) params.set(key, String(value));
    });
    return `/admin/contacts?${params}`;
  };
  return (
    <div className="admin-page contacts-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Email audiences</p>
          <h1>Contacts</h1>
          <p>
            Keep attendees and business owners organized for future campaigns.
          </p>
        </div>
        <ContactExport filters={filters} />
      </header>
      <div className="contacts-totals" aria-label="All contacts by status">
        {["SUBSCRIBED", "UNSUBSCRIBED", "CLEANED"].map((status) => (
          <section className="admin-panel" key={status}>
            <strong>
              {directory.counts.find((count) => count.status === status)
                ?._count ?? 0}
            </strong>
            <span>{statusLabel(status)}</span>
          </section>
        ))}
      </div>
      <ContactImport />
      <section className="admin-panel admin-filter-panel">
        <h2 className="sr-only">Filter contacts</h2>
        <form className="contacts-filters">
          <label className="ui-field">
            <span>Search contacts</span>
            <input
              className="ui-input"
              name="q"
              defaultValue={filters.q}
              placeholder="Name or email"
            />
          </label>
          <label className="ui-field">
            <span>Category</span>
            <select
              className="ui-input"
              name="category"
              defaultValue={filters.category ?? ""}
            >
              <option value="">All categories</option>
              <option value="ATTENDEE">Estate Sale Attendees</option>
              <option value="BUSINESS_OWNER">Business Owners</option>
            </select>
          </label>
          <label className="ui-field">
            <span>Status</span>
            <select
              className="ui-input"
              name="status"
              defaultValue={filters.status ?? ""}
            >
              <option value="">All statuses</option>
              {["SUBSCRIBED", "UNSUBSCRIBED", "CLEANED"].map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <label className="ui-field">
            <span>Partner / source</span>
            <select
              className="ui-input"
              name="sourceTag"
              defaultValue={filters.sourceTag}
            >
              <option value="">All sources</option>
              {directory.tags.map((tag) => (
                <option key={tag}>{tag}</option>
              ))}
            </select>
          </label>
          <button className="ui-button ui-button--primary" type="submit">
            Apply
          </button>
        </form>
      </section>
      <section className="admin-panel admin-panel--table">
        <div className="admin-table-toolbar">
          <div>
            <strong>{directory.total} matching contacts</strong>
            <span>Mailing contacts are separate from app login accounts.</span>
          </div>
        </div>
        {directory.rows.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <caption>Contacts, page {filters.page}</caption>
              <thead>
                <tr>
                  <th scope="col">Contact</th>
                  <th scope="col">Category</th>
                  <th scope="col">Source</th>
                  <th scope="col">Status</th>
                  <th scope="col">Manage</th>
                </tr>
              </thead>
              <tbody>
                {directory.rows.map((row) => (
                  <tr key={row.id}>
                    <td data-label="Contact">
                      <span>
                        <strong>
                          {[row.firstName, row.lastName]
                            .filter(Boolean)
                            .join(" ") || "—"}
                        </strong>
                        <br />
                        {row.email}
                      </span>
                    </td>
                    <td data-label="Category">{categoryLabel(row.category)}</td>
                    <td data-label="Source">{row.sourceTags.join(", ")}</td>
                    <td data-label="Status">
                      <span
                        className={`admin-status ${row.status === "SUBSCRIBED" ? "admin-status--success" : "admin-status--warning"}`}
                      >
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td data-label="Manage">
                      {row.status === "SUBSCRIBED" ? (
                        <ContactUnsubscribe id={row.id} />
                      ) : (
                        "Suppressed"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="contacts-empty">
            No contacts match. Import a CSV or adjust the filters.
          </p>
        )}
        <nav
          className="admin-actions contacts-pagination"
          aria-label="Contacts pagination"
        >
          {filters.page > 1 && (
            <Link href={pageLink(filters.page - 1)}>Previous</Link>
          )}
          <span>
            Page {filters.page} of{" "}
            {Math.max(1, Math.ceil(directory.total / 100))}
          </span>
          {filters.page * 100 < directory.total && (
            <Link href={pageLink(filters.page + 1)}>Next</Link>
          )}
        </nav>
      </section>
      <section className="admin-panel contacts-import">
        <h2>Recent contact imports</h2>
        <p>
          Saving contacts does not subscribe them to an automated campaign. Use
          the subscribed CSV when preparing a future send.
        </p>
        {directory.imports.length ? (
          <ul>
            {directory.imports.map((batch) => (
              <li key={batch.id}>
                <strong>{batch.sourceTag}</strong> ·{" "}
                {categoryLabel(batch.category)} ·{" "}
                {new Intl.DateTimeFormat("en-US", {
                  dateStyle: "medium",
                  timeZone: "America/Los_Angeles",
                }).format(batch.createdAt)}{" "}
                · {(batch.summary as { total?: number }).total ?? 0} contacts
              </li>
            ))}
          </ul>
        ) : (
          <p>No contact imports yet.</p>
        )}
      </section>
    </div>
  );
}
