import Link from "next/link";

import { Icon } from "@/components/ui/icons";
import {
  createConfiguredAdminUserDirectory,
  userDirectoryCriteria,
} from "@/modules/admin";
import { getCurrentUser, requireSuperAdminPrincipal } from "@/modules/auth";

import { MarketingExport } from "./_components/marketing-export";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "America/Los_Angeles",
  }).format(value);
}

function formatSpent(values: Array<{ currency: string; amount: number }>) {
  return values.length
    ? values
        .map((value) =>
          new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: value.currency.toUpperCase(),
          }).format(value.amount / 100),
        )
        .join(" · ")
    : "—";
}

export default async function AdminUsersPage({
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
  const raw = await searchParams;
  const criteria = userDirectoryCriteria(raw);
  const directory = await createConfiguredAdminUserDirectory().list(
    principal,
    criteria,
  );
  const query = new URLSearchParams();
  if (criteria.search) query.set("q", criteria.search);
  query.set("filter", criteria.filter);
  if (directory.nextCursor) query.set("cursor", directory.nextCursor);
  const marketingQuery = new URLSearchParams({ filter: "marketing" });
  if (criteria.search) marketingQuery.set("q", criteria.search);

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <div className="admin-page-header__kicker">
            <p className="eyebrow">Accounts and customers</p>
            <span className="admin-section-count">
              {directory.rows.length} on this page
            </span>
          </div>
          <h1>Users</h1>
          <p>Inspect signup, listing, purchase, and consent history.</p>
        </div>
        <div className="admin-page-header__actions">
          {criteria.filter === "marketing" ? (
            <MarketingExport search={criteria.search} />
          ) : (
            <Link
              className="ui-button ui-button--secondary"
              href={`/admin/users?${marketingQuery}`}
            >
              Export contacts
            </Link>
          )}
        </div>
      </header>
      <section
        className="admin-panel admin-filter-panel"
        aria-labelledby="user-directory-title"
      >
        <h2 className="sr-only" id="user-directory-title">
          User directory
        </h2>
        <form className="admin-directory-form">
          <label className="ui-field admin-search-field">
            <span className="ui-field__label">Search users</span>
            <span className="admin-search-field__control">
              <Icon name="search" size={19} />
              <input
                className="ui-input"
                defaultValue={criteria.search}
                name="q"
                placeholder="Name, email, or exact UUID"
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
              <option value="all">All</option>
              <option value="verified">Verified</option>
              <option value="unverified">Unverified</option>
              <option value="published">Published organizers</option>
              <option value="marketing">Marketing eligible</option>
              <option value="restricted">Restricted</option>
            </select>
          </label>
          <button className="ui-button ui-button--primary" type="submit">
            Apply
          </button>
        </form>
        <p className="admin-filter-panel__helper">
          Contact export includes active, verified users who explicitly opted
          into marketing. Choose the marketing-eligible filter to download it.
        </p>
      </section>
      <section className="admin-panel admin-panel--table">
        <div className="admin-table-toolbar">
          <div>
            <strong>User directory</strong>
            <span>Ordered by newest signup</span>
          </div>
          <span className="admin-section-count">
            {directory.rows.length} results
          </span>
        </div>
        {directory.rows.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <caption>{directory.rows.length} users on this page</caption>
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Verification</th>
                  <th scope="col">Signup</th>
                  <th scope="col">Last activity</th>
                  <th scope="col">Listings</th>
                  <th scope="col">Purchases</th>
                  <th scope="col">Total spent</th>
                  <th scope="col">Marketing</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {directory.rows.map((user) => (
                  <tr key={user.id}>
                    <td data-label="User">
                      <Link
                        className="admin-table__primary"
                        href={`/admin/users/${user.id}`}
                      >
                        {user.name}
                      </Link>
                      <br />
                      <small>{user.email}</small>
                    </td>
                    <td data-label="Verification">
                      <span
                        className={`admin-status ${user.verified ? "admin-status--success" : "admin-status--warning"}`}
                      >
                        {user.verified ? "Verified" : "Unverified"}
                      </span>
                    </td>
                    <td data-label="Signup">{formatDate(user.createdAt)}</td>
                    <td data-label="Last activity">
                      {formatDate(user.lastActivityAt)}
                    </td>
                    <td data-label="Listings">
                      {user.listings} created · {user.publications} published
                    </td>
                    <td data-label="Purchases">{user.purchases}</td>
                    <td data-label="Total spent">{formatSpent(user.spent)}</td>
                    <td data-label="Marketing">
                      <span
                        className={`admin-status ${user.marketingEligible ? "admin-status--success" : ""}`}
                      >
                        {user.marketingEligible ? "Eligible" : "Not eligible"}
                      </span>
                    </td>
                    <td data-label="Status">
                      <span
                        className={`admin-status ${user.status === "ACTIVE" ? "admin-status--success" : "admin-status--warning"}`}
                      >
                        {user.role === "SUPER_ADMIN" ? "Owner" : user.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No users match these criteria.</p>
        )}
        <div className="admin-pagination">
          <span>Newest accounts appear first</span>
          {directory.nextCursor ? (
            <Link
              className="ui-button ui-button--secondary"
              href={`/admin/users?${query}`}
            >
              Next page
            </Link>
          ) : null}
        </div>
      </section>
    </div>
  );
}
