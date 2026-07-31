import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import {
  AdminNotFoundError,
  createConfiguredAdminUserDetail,
} from "@/modules/admin";
import { getCurrentUser, requireSuperAdminPrincipal } from "@/modules/auth";

import { UserActions } from "../_components/user-actions";

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

function actionLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const principal = requireSuperAdminPrincipal(await getCurrentUser());
  const id = z
    .string()
    .uuid()
    .safeParse((await params).userId);
  if (!id.success) notFound();
  let user;
  try {
    user = await createConfiguredAdminUserDetail().get(principal, id.data);
  } catch (error) {
    if (error instanceof AdminNotFoundError) notFound();
    throw error;
  }

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">User detail</p>
          <h1>{user.name}</h1>
          <p>{user.email}</p>
        </div>
        <UserActions
          capabilities={user.capabilities}
          name={user.name}
          updatedAt={user.updatedAt.toISOString()}
          userId={user.id}
        />
      </header>

      <section className="admin-panel" aria-labelledby="identity-title">
        <header>
          <h2 id="identity-title">Identity and account</h2>
        </header>
        <dl className="admin-detail-list">
          <div>
            <dt>User ID</dt>
            <dd>{user.id}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>
              {user.role === "SUPER_ADMIN" ? "Super administrator" : "User"}
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{user.status}</dd>
          </div>
          <div>
            <dt>Email verification</dt>
            <dd>
              {user.emailVerifiedAt
                ? `Verified ${formatDate(user.emailVerifiedAt)}`
                : "Unverified"}
            </dd>
          </div>
          <div>
            <dt>Signup date</dt>
            <dd>{formatDate(user.createdAt)}</dd>
          </div>
          <div>
            <dt>Last login</dt>
            <dd>{formatDate(user.lastLoginAt)}</dd>
          </div>
          <div>
            <dt>Last meaningful activity</dt>
            <dd>{formatDate(user.lastActivityAt)}</dd>
          </div>
          <div>
            <dt>Restriction</dt>
            <dd>
              {user.restrictedAt
                ? `${formatDate(user.restrictedAt)} — ${user.restrictionReason ?? "No reason available"}`
                : "Not restricted"}
            </dd>
          </div>
        </dl>
      </section>

      <div className="admin-grid--two">
        <section
          className="admin-panel"
          aria-labelledby="marketing-detail-title"
        >
          <header>
            <h2 id="marketing-detail-title">Marketing consent</h2>
          </header>
          <dl className="admin-detail-list">
            <div>
              <dt>Eligible</dt>
              <dd>
                {user.marketing?.consentAt &&
                !user.marketing.unsubscribedAt &&
                user.status === "ACTIVE" &&
                user.emailVerifiedAt &&
                user.role === "USER"
                  ? "Yes"
                  : "No"}
              </dd>
            </div>
            <div>
              <dt>Consent date</dt>
              <dd>{formatDate(user.marketing?.consentAt)}</dd>
            </div>
            <div>
              <dt>Version / source</dt>
              <dd>
                {user.marketing?.consentVersion ?? "—"} /{" "}
                {user.marketing?.consentSource ?? "—"}
              </dd>
            </div>
            <div>
              <dt>Unsubscribed</dt>
              <dd>{formatDate(user.marketing?.unsubscribedAt)}</dd>
            </div>
          </dl>
        </section>
        <section
          className="admin-panel"
          aria-labelledby="purchase-summary-title"
        >
          <header>
            <h2 id="purchase-summary-title">Purchase summary</h2>
          </header>
          <p>
            <strong>{user.successfulPurchases}</strong> successful purchases
          </p>
          {user.spent.length ? (
            <ul>
              {user.spent.map((value) => (
                <li key={value.currency}>
                  {money(value.amount, value.currency)}{" "}
                  {value.currency.toUpperCase()}
                </li>
              ))}
            </ul>
          ) : (
            <p>No successful paid total.</p>
          )}
        </section>
      </div>

      <section className="admin-panel" aria-labelledby="user-listings-title">
        <header>
          <h2 id="user-listings-title">Listings</h2>
        </header>
        {user.listings.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <caption>
                Recent drafts, publications, and canceled listings
              </caption>
              <thead>
                <tr>
                  <th scope="col">Listing</th>
                  <th scope="col">Lifecycle</th>
                  <th scope="col">Publication</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {user.listings.map((listing) => (
                  <tr key={listing.id}>
                    <td data-label="Listing">
                      <Link href={`/admin/listings/${listing.id}`}>
                        {listing.title}
                      </Link>
                    </td>
                    <td data-label="Lifecycle">
                      <span className="admin-status">{listing.lifecycle}</span>
                    </td>
                    <td data-label="Publication">
                      {listing.published
                        ? "Published historically"
                        : "Never published"}
                    </td>
                    <td data-label="Updated">
                      {formatDate(listing.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No listings created.</p>
        )}
      </section>

      <section className="admin-panel" aria-labelledby="payment-history-title">
        <header>
          <h2 id="payment-history-title">Payment history</h2>
        </header>
        {user.payments.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <caption>Recent internal payment attempts</caption>
              <thead>
                <tr>
                  <th scope="col">Attempt</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Payment</th>
                  <th scope="col">Checkout</th>
                  <th scope="col">Fulfillment</th>
                  <th scope="col">Created / paid</th>
                </tr>
              </thead>
              <tbody>
                {user.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td data-label="Attempt">
                      <Link href={`/admin/listings/${payment.eventId}`}>
                        {payment.id}
                      </Link>
                    </td>
                    <td data-label="Amount">
                      {money(payment.expectedAmount, payment.expectedCurrency)}
                    </td>
                    <td data-label="Payment">{payment.paymentState}</td>
                    <td data-label="Checkout">{payment.checkoutState}</td>
                    <td data-label="Fulfillment">{payment.fulfillmentState}</td>
                    <td data-label="Created / paid">
                      {formatDate(payment.createdAt)} /{" "}
                      {formatDate(payment.paidAt)}
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

      <section className="admin-panel" aria-labelledby="account-activity-title">
        <header>
          <h2 id="account-activity-title">Account activity</h2>
        </header>
        {user.activity.length ? (
          <ol className="admin-activity-list">
            {user.activity.map((entry) => (
              <li key={entry.id}>
                <span>
                  <strong>{actionLabel(entry.action)}</strong>
                  <time dateTime={entry.occurredAt.toISOString()}>
                    {formatDate(entry.occurredAt)}
                  </time>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p>No allowlisted activity.</p>
        )}
      </section>
    </div>
  );
}
