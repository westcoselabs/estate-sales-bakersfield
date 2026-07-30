import Link from "next/link";

import { Icon } from "@/components/ui/icons";

import type { DashboardListing } from "../_lib/listings";

export type ListingView =
  "all" | "drafts" | "ready" | "published" | "attention";

const views: ReadonlyArray<{ key: ListingView; label: string }> = [
  { key: "all", label: "All" },
  { key: "drafts", label: "Drafts" },
  { key: "ready", label: "Ready" },
  { key: "published", label: "Published" },
  { key: "attention", label: "Needs Attention" },
];

const attentionStates = new Set([
  "PAYMENT_CANCELED",
  "CHECKOUT_EXPIRED",
  "PAID_PUBLICATION_BLOCKED",
  "FULFILLMENT_RETRYING",
  "MANUAL_REVIEW_REQUIRED",
]);
const readyStates = new Set([
  "READY_FOR_REVIEW",
  "APPROVED",
  "READY_FOR_PAYMENT",
  "CHECKOUT_CREATED",
]);

function formatDate(value: string, timeZone = "America/Los_Angeles"): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(new Date(value));
}

export function listingMatches(
  listing: DashboardListing,
  view: ListingView,
): boolean {
  if (view === "all") return true;
  if (view === "published") return listing.payment.displayState === "PUBLISHED";
  if (view === "attention")
    return attentionStates.has(listing.payment.displayState);
  if (view === "ready") return readyStates.has(listing.payment.displayState);
  return listing.payment.displayState === "DRAFT_INCOMPLETE";
}

function tone(listing: DashboardListing): string {
  if (listing.payment.displayState === "PUBLISHED") return "success";
  if (attentionStates.has(listing.payment.displayState)) return "error";
  if (readyStates.has(listing.payment.displayState)) return "info";
  return "neutral";
}

function statusLabel(listing: DashboardListing): string {
  const state = listing.payment.displayState;
  const labels: Partial<Record<typeof state, string>> = {
    DRAFT_INCOMPLETE: "Draft",
    READY_FOR_REVIEW: "Ready for review",
    APPROVED: "Approved",
    READY_FOR_PAYMENT: "Ready for payment",
    CHECKOUT_CREATED: "Checkout started",
    PAYMENT_PENDING: "Payment pending",
    PAYMENT_RECEIVED_PUBLISHING: "Publishing",
    PUBLISHED: "Published",
    PAYMENT_CANCELED: "Payment canceled",
    CHECKOUT_EXPIRED: "Checkout expired",
    PAID_PUBLICATION_BLOCKED: "Publication blocked",
    FULFILLMENT_RETRYING: "Publication retrying",
    MANUAL_REVIEW_REQUIRED: "Review required",
  };
  return labels[state] ?? state.replaceAll("_", " ");
}

export function listingPrimaryAction(listing: DashboardListing): {
  href: string;
  label: string;
} {
  const { event, payment } = listing;
  if (payment.displayState === "PUBLISHED" && payment.canonicalPath) {
    return { href: payment.canonicalPath, label: "View live listing" };
  }
  if (
    [
      "READY_FOR_PAYMENT",
      "CHECKOUT_CREATED",
      "PAYMENT_CANCELED",
      "CHECKOUT_EXPIRED",
    ].includes(payment.displayState)
  ) {
    return {
      href: `/dashboard/events/${event.id}/payment`,
      label: "Continue payment",
    };
  }
  if (
    [
      "PAYMENT_PENDING",
      "PAYMENT_RECEIVED_PUBLISHING",
      "PAID_PUBLICATION_BLOCKED",
      "FULFILLMENT_RETRYING",
      "MANUAL_REVIEW_REQUIRED",
    ].includes(payment.displayState)
  ) {
    return {
      href: `/dashboard/events/${event.id}/payment`,
      label: "Review status",
    };
  }
  if (event.approvalReady) {
    return {
      href: `/dashboard/events/${event.id}/preview`,
      label: "Review listing",
    };
  }
  return {
    href: `/dashboard/events/${event.id}/edit`,
    label: "Continue editing",
  };
}

export function ListingTabs({
  current,
  listings,
}: {
  readonly current: ListingView;
  readonly listings: readonly DashboardListing[];
}) {
  return (
    <nav className="listing-tabs" aria-label="Listing views">
      {views.map((view) => {
        const count = listings.filter((listing) =>
          listingMatches(listing, view.key),
        ).length;
        return (
          <Link
            key={view.key}
            href={
              view.key === "all"
                ? "/dashboard/events"
                : `/dashboard/events?view=${view.key}`
            }
            aria-current={current === view.key ? "page" : undefined}
          >
            <span>{view.label}</span>
            <span className="listing-tabs__count">{count}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function ListingCollection({
  listings,
  view,
}: {
  readonly listings: readonly DashboardListing[];
  readonly view: ListingView;
}) {
  const visible = listings.filter((listing) => listingMatches(listing, view));
  if (!visible.length) {
    return (
      <section className="dashboard-empty">
        <span className="dashboard-empty__icon">
          <Icon name="list" />
        </span>
        <h2>
          No{" "}
          {view === "all"
            ? "listings"
            : views.find((item) => item.key === view)?.label.toLowerCase()}{" "}
          yet
        </h2>
        <p>
          {view === "published"
            ? "Published sales will appear here after payment and publication are confirmed."
            : view === "attention"
              ? "Nothing currently needs your attention."
              : "Create a sale draft, then return here to track its real status."}
        </p>
        {view !== "attention" ? (
          <Link
            className="ui-button ui-button--primary"
            href="/dashboard/events/new"
          >
            <Icon name="plus" /> Create event
          </Link>
        ) : null}
      </section>
    );
  }
  return (
    <div className="dashboard-listing-grid">
      {visible.map((listing) => {
        const action = listingPrimaryAction(listing);
        const isEstateSale = listing.event.eventType === "ESTATE_SALE";
        return (
          <article className="dashboard-listing-card" key={listing.event.id}>
            <header className="dashboard-listing-card__header">
              <span className="dashboard-listing-card__mark" aria-hidden="true">
                <Icon
                  name={isEstateSale ? "estate" : "yard"}
                  size={26}
                  weight="regular"
                />
              </span>
              <div className="dashboard-listing-card__identity">
                <span className="dashboard-listing-card__type">
                  {isEstateSale ? "Estate sale" : "Yard sale"}
                </span>
                <h2>{listing.event.title ?? "Untitled sale"}</h2>
              </div>
              <span className={`status-badge status-badge--${tone(listing)}`}>
                {statusLabel(listing)}
              </span>
            </header>
            <p className="dashboard-listing-card__message">
              {listing.payment.message}
            </p>
            <dl className="dashboard-listing-card__meta">
              <div>
                <dt>
                  <Icon name="calendar" size={17} /> Schedule
                </dt>
                <dd>
                  {listing.event.startsAt
                    ? formatDate(
                        listing.event.startsAt,
                        listing.event.timezone ?? "America/Los_Angeles",
                      )
                    : "Not set"}
                </dd>
              </div>
              <div>
                <dt>
                  <Icon name="photo" size={17} /> Photos
                </dt>
                <dd>
                  {listing.event.readyPhotoCount} ready
                  {listing.event.hasReadyCover ? ", cover set" : ""}
                </dd>
              </div>
              <div>
                <dt>
                  <Icon name="clock" size={17} /> Updated
                </dt>
                <dd>{formatDate(listing.event.updatedAt)}</dd>
              </div>
            </dl>
            <div className="dashboard-listing-card__actions">
              <Link className="ui-button ui-button--primary" href={action.href}>
                {action.label} <Icon name="arrow" size={18} />
              </Link>
              <div className="dashboard-listing-card__secondary-actions">
                {listing.payment.displayState !== "PUBLISHED" ? (
                  <Link
                    className="ui-text-link"
                    href={`/dashboard/events/${listing.event.id}/edit`}
                  >
                    <Icon name="edit" size={18} /> Edit
                  </Link>
                ) : null}
                <Link
                  className="ui-text-link"
                  href={`/dashboard/events/${listing.event.id}/payment`}
                >
                  <Icon name="status" size={18} /> Status
                </Link>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
