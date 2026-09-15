import Link from "next/link";

import { PublicShell } from "@/components/shells/shells";
import {
  BAKERSFIELD_TIMEZONE,
  normalizeSearchQuery,
  resolvePublicDateInterval,
  type PublicSearchRawQuery,
} from "@/modules/public-search";

import { salesHubCursor, salesHubs, type SalesHubKey } from "./sales-hub-data";
import { SalesHubListings } from "./sales-hub-listings";
import { listingRequestTime } from "./published-listing-loader";

export function DateSalesHub({
  hubKey,
  query,
}: {
  readonly hubKey: Extract<
    SalesHubKey,
    "estate-weekend" | "yard-weekend" | "today"
  >;
  readonly query: PublicSearchRawQuery;
}) {
  const hub = salesHubs[hubKey];
  const cursor = salesHubCursor(query);
  const interval = resolvePublicDateInterval(
    normalizeSearchQuery({ date: hub.date }).criteria,
    listingRequestTime(),
  );
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: BAKERSFIELD_TIMEZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const dates = interval
    ? hub.date === "today"
      ? format.format(interval.startsAt)
      : `${format.format(interval.startsAt)} – ${format.format(new Date(interval.endsAt.getTime() - 1))}`
    : "";
  return (
    <PublicShell>
      <div className="marketing-page category-page">
        <nav className="marketing-breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">
            {hub.date === "today" ? "Sales today" : "This weekend"}
          </span>
        </nav>
        <section className="category-hero">
          <div>
            <p className="eyebrow">Bakersfield, California</p>
            <h1>{hub.heading}</h1>
            <p>{hub.description}</p>
            <p>
              <strong>{dates}</strong> · Bakersfield local time
            </p>
            <div className="marketing-actions">
              <Link
                className="ui-button ui-button--secondary"
                href="/estate-sales"
              >
                All estate sales
              </Link>
              <Link
                className="ui-button ui-button--secondary"
                href="/yard-sales"
              >
                All yard sales
              </Link>
            </div>
          </div>
          <aside>
            <h2>
              {hub.date === "today"
                ? "Check the hours before you leave"
                : "Plan your weekend stops"}
            </h2>
            <p>
              {hub.date === "today"
                ? "These listings overlap today's date. A sale may open later or have already closed for the day, so review its published hours before you travel."
                : "Weekend results cover the upcoming Friday through Sunday, or the remaining weekend days. Multi-day sales appear when their schedule overlaps this period."}
            </p>
          </aside>
        </section>
        <SalesHubListings hubKey={hubKey} cursor={cursor} />
        <section className="marketing-section category-guide">
          <h2>Before you visit</h2>
          <div className="category-guide__grid">
            <article>
              <h3>Review the individual listing</h3>
              <p>
                Check opening times, sale details, and any source notes. For an
                external listing, follow the original source for updates before
                traveling.
              </p>
            </article>
            <article>
              <h3>Respect address availability</h3>
              <p>
                Some organizers show an approximate area until their chosen
                address release time. An area pin is not an entrance or a
                confirmed driving destination.
              </p>
            </article>
            <article>
              <h3>Keep your plans flexible</h3>
              <p>
                Items can sell throughout the day. Photos show the sale&apos;s
                collection and do not guarantee that a particular item will
                still be available.
              </p>
            </article>
          </div>
        </section>
        <nav className="marketing-actions" aria-label="Browse sale dates">
          <Link href="/sales-today">Sales today</Link>
          <Link href="/estate-sales/this-weekend">
            Estate sales this weekend
          </Link>
          <Link href="/yard-sales/this-weekend">Yard sales this weekend</Link>
        </nav>
      </div>
    </PublicShell>
  );
}
