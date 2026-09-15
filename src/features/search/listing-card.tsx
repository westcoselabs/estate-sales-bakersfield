import Link from "next/link";
import { ListingCoverImage } from "./listing-cover-image";

import { Icon } from "@/components/ui/icons";
import type {
  PublicListingCardProjection,
  PublicMapMarkerProjection,
} from "@/modules/public-search/client";

function localDate(value: string): Date {
  return new Date(`${value}:00Z`);
}

const shortDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const weekdayDate = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const timeFormat = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

export function formatListingSchedule(listing: PublicListingCardProjection): {
  readonly date: string;
  readonly time: string;
} {
  const days = listing.scheduleDays;
  if (days?.length) {
    const first = days[0]!;
    const last = days[days.length - 1]!;
    const firstDate = localDate(`${first.date}T${first.startTime}`);
    const lastDate = localDate(`${last.date}T${last.endTime}`);
    const matchingHours = days.every(
      (day) =>
        day.startTime === first.startTime && day.endTime === first.endTime,
    );
    const consecutive = days.every(
      (day, index) =>
        index === 0 ||
        new Date(`${day.date}T00:00:00Z`).getTime() -
          new Date(`${days[index - 1]!.date}T00:00:00Z`).getTime() ===
          86_400_000,
    );
    return {
      date:
        days.length === 1
          ? weekdayDate.format(firstDate)
          : `${shortDate.format(firstDate)} to ${shortDate.format(lastDate)}${consecutive ? "" : ` · ${String(days.length)} sale days`}`,
      time: matchingHours
        ? `${timeFormat.format(firstDate)} to ${timeFormat.format(localDate(`${first.date}T${first.endTime}`))}${days.length > 1 && consecutive ? " daily" : ""}`
        : "Hours vary by day",
    };
  }
  const start = localDate(listing.localStartsAt);
  const end = localDate(listing.localEndsAt);
  const sameDay =
    listing.localStartsAt.slice(0, 10) === listing.localEndsAt.slice(0, 10);
  const date = sameDay
    ? weekdayDate.format(start)
    : `${shortDate.format(start)} to ${shortDate.format(end)}`;
  return {
    date,
    time: sameDay
      ? `${timeFormat.format(start)} to ${timeFormat.format(end)}`
      : "See listing for daily hours",
  };
}

function directionsHref(marker?: PublicMapMarkerProjection): string | null {
  if (!marker || marker.markerKind !== "exact") return null;
  const [longitude, latitude] = marker.geometry.coordinates;
  return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=;${String(latitude)},${String(longitude)}`;
}

export function ListingCard({
  listing,
  marker,
  variant = "list",
  priority = false,
  onDismiss,
}: {
  readonly listing: PublicListingCardProjection;
  readonly marker?: PublicMapMarkerProjection | undefined;
  readonly variant?: "list" | "preview";
  readonly priority?: boolean;
  readonly onDismiss?: () => void;
}) {
  const schedule = formatListingSchedule(listing);
  const directions = directionsHref(marker);
  return (
    <article
      className={`market-listing-card market-listing-card--${variant}`}
      data-result-card="true"
    >
      {onDismiss ? (
        <button
          className="market-listing-card__dismiss"
          type="button"
          aria-label="Close listing preview"
          onClick={onDismiss}
        >
          <Icon name="close" size={18} />
        </button>
      ) : null}
      <Link
        className="market-listing-card__media"
        href={listing.href}
        aria-label={`View ${listing.title}`}
      >
        <ListingCoverImage
          src={listing.coverPhotoUrl.replace(
            /^\/media\/([^/?#]+)\/cover$/,
            "/media/$1/card",
          )}
          alt={`${listing.title} listing cover`}
          priority={priority}
        />
      </Link>
      <div className="market-listing-card__body">
        <h3 className="market-listing-card__title">
          <Link href={listing.href}>{listing.title}</Link>
        </h3>
        {listing.unclaimed ? (
          <p className="market-listing-card__privacy">
            Unclaimed external listing
            {listing.sourceLabel ? ` · ${listing.sourceLabel}` : ""}
          </p>
        ) : null}
        <p className="market-listing-card__location">
          <Icon name="pin" size={17} />
          <span>{listing.location.label}</span>
        </p>
        <div className="market-listing-card__meta">
          <span>
            <Icon name="calendar" size={17} />
            {schedule.date}
          </span>
          <span>
            <Icon name="clock" size={17} />
            {schedule.time}
          </span>
        </div>
        {listing.location.kind === "hidden" ? (
          <p className="market-listing-card__privacy">
            {listing.location.releasesAt
              ? `Address available ${new Intl.DateTimeFormat("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  timeZoneName: "short",
                  timeZone: listing.timezone,
                }).format(new Date(listing.location.releasesAt))}`
              : "Address hidden · Approximate area shown"}
          </p>
        ) : listing.location.kind === "approximate" ? (
          <p className="market-listing-card__privacy">Approximate area shown</p>
        ) : null}
        <div className="market-listing-card__actions">
          <Link className="ui-button ui-button--primary" href={listing.href}>
            View details
          </Link>
          {directions ? (
            <a href={directions} target="_blank" rel="noopener noreferrer">
              Get directions
              <Icon name="external" size={16} />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function ListingCardSkeleton({
  variant = "list",
}: {
  readonly variant?: "list" | "preview";
}) {
  return (
    <div
      className={`market-listing-card market-listing-card--${variant} market-listing-card--skeleton`}
      aria-hidden="true"
    >
      <span className="market-listing-card__media ui-skeleton" />
      <span className="market-listing-card__body">
        <span className="ui-skeleton market-skeleton--title" />
        <span className="ui-skeleton market-skeleton--line" />
        <span className="ui-skeleton market-skeleton--line-short" />
        <span className="ui-skeleton market-skeleton--action" />
      </span>
    </div>
  );
}

export function ListingGridSkeleton({
  count = 5,
}: {
  readonly count?: number;
}) {
  return (
    <div className="market-listing-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <ListingCardSkeleton key={index} />
      ))}
    </div>
  );
}
