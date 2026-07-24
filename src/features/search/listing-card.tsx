import Link from "next/link";

import { Icon } from "@/components/ui/icons";
import type { PublicListingCardProjection } from "@/modules/public-search";

function localDate(value: string): Date {
  return new Date(`${value}:00Z`);
}

function formatSchedule(listing: PublicListingCardProjection): {
  readonly date: string;
  readonly time: string;
} {
  const start = localDate(listing.localStartsAt);
  const end = localDate(listing.localEndsAt);
  const sameDay =
    listing.localStartsAt.slice(0, 10) === listing.localEndsAt.slice(0, 10);
  const shortDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const date = sameDay
    ? new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(start)
    : `${shortDate.format(start)} to ${shortDate.format(end)}`;
  const timeFormat = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
  return {
    date,
    time: `${timeFormat.format(start)} to ${timeFormat.format(end)}`,
  };
}

export function ListingCard({
  listing,
  variant = "grid",
  priority = false,
}: {
  readonly listing: PublicListingCardProjection;
  readonly variant?: "grid" | "compact";
  readonly priority?: boolean;
}) {
  const schedule = formatSchedule(listing);
  const typeLabel = listing.saleType === "estate" ? "Estate sale" : "Yard sale";
  return (
    <article className={`market-listing-card market-listing-card--${variant}`}>
      <Link className="market-listing-card__link" href={listing.href}>
        <span className="market-listing-card__media">
          {/* The public media route owns authorization and the optimized variant. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={listing.coverPhotoUrl}
            alt={`${listing.title} listing cover`}
            width="800"
            height="600"
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding="async"
          />
        </span>
        <span className="market-listing-card__body">
          <span
            className={`market-listing-card__type market-listing-card__type--${listing.saleType}`}
          >
            {typeLabel}
          </span>
          <strong className="market-listing-card__title">
            {listing.title}
          </strong>
          <span className="market-listing-card__meta">
            <span>
              <Icon name="calendar" size={17} />
              {schedule.date}
            </span>
            <span>{schedule.time}</span>
          </span>
          <span className="market-listing-card__location">
            <Icon name="pin" size={17} />
            <span>{listing.location.label}</span>
          </span>
          {listing.location.kind === "hidden" ? (
            <span className="market-listing-card__privacy">
              Address available when the sale starts
            </span>
          ) : listing.location.kind === "approximate" ? (
            <span className="market-listing-card__privacy">
              Approximate area shown
            </span>
          ) : null}
        </span>
      </Link>
    </article>
  );
}

export function ListingCardSkeleton({
  variant = "grid",
}: {
  readonly variant?: "grid" | "compact";
}) {
  return (
    <div
      className={`market-listing-card market-listing-card--${variant} market-listing-card--skeleton`}
      aria-hidden="true"
    >
      <span className="market-listing-card__media ui-skeleton" />
      <span className="market-listing-card__body">
        <span className="ui-skeleton market-skeleton--badge" />
        <span className="ui-skeleton market-skeleton--title" />
        <span className="ui-skeleton market-skeleton--line" />
        <span className="ui-skeleton market-skeleton--line-short" />
      </span>
    </div>
  );
}

export function ListingGridSkeleton({
  count = 4,
  variant = "grid",
}: {
  readonly count?: number;
  readonly variant?: "grid" | "compact";
}) {
  return (
    <div className={`market-listing-grid market-listing-grid--${variant}`}>
      {Array.from({ length: count }, (_, index) => (
        <ListingCardSkeleton key={index} variant={variant} />
      ))}
    </div>
  );
}
