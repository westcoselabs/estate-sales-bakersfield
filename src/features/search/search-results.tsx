import Link from "next/link";

import { Icon } from "@/components/ui/icons";
import {
  buildSearchHref,
  type PublicSearchIssue,
  type PublicSearchPage,
} from "@/modules/public-search";

import { ListingCard } from "./listing-card";

export function SearchResults({
  result,
  issue,
}: {
  readonly result: PublicSearchPage | null;
  readonly issue?: PublicSearchIssue | null;
}) {
  if (issue) {
    return (
      <section className="search-state search-state--error" role="alert">
        <Icon name="warning" size={26} />
        <div>
          <h2>Check your date range</h2>
          <p>{issue.message}</p>
          <Link href="/search">Show all upcoming sales</Link>
        </div>
      </section>
    );
  }
  if (!result) {
    return (
      <section className="search-state search-state--error" role="alert">
        <Icon name="warning" size={26} />
        <div>
          <h2>We could not load sale results</h2>
          <p>
            Your search is still safe. Try again without changing the current
            filters.
          </p>
          <Link href="/search">Try again</Link>
        </div>
      </section>
    );
  }

  const count = result.items.length;
  return (
    <>
      <div className="search-results-heading">
        <div>
          <p className="eyebrow">Bakersfield, California</p>
          <h2>
            {count === 0
              ? "No matching sales yet"
              : `${String(count)} ${count === 1 ? "sale" : "sales"} shown`}
          </h2>
        </div>
        <p>Soonest first</p>
      </div>

      {result.criteria.view === "map" ? (
        <section className="search-map-unavailable" aria-labelledby="map-title">
          <span className="search-map-unavailable__icon" aria-hidden="true">
            <Icon name="map" size={28} />
          </span>
          <div>
            <p className="eyebrow">Map view</p>
            <h2 id="map-title">The interactive map is not available yet</h2>
            <p>
              We&apos;re preparing a privacy-safe map. For now, continue in list
              view; your current sale type and date filters will stay applied.
            </p>
            <Link
              className="ui-button ui-button--secondary"
              href={buildSearchHref(result.criteria, { view: "list" })}
            >
              Continue in list view
            </Link>
          </div>
        </section>
      ) : null}

      {count > 0 ? (
        <div
          className={`market-listing-grid ${
            result.criteria.view === "map" ? "market-listing-grid--compact" : ""
          }`}
        >
          {result.items.map((listing, index) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              variant={result.criteria.view === "map" ? "compact" : "grid"}
              priority={index === 0}
            />
          ))}
        </div>
      ) : (
        <section className="search-state search-state--empty">
          <span aria-hidden="true">
            <Icon name="search" size={28} />
          </span>
          <div>
            <h2>No sales match these filters yet</h2>
            <p>
              Try all upcoming dates or switch sale type. New listings will
              appear here when they are published.
            </p>
            <Link className="ui-button ui-button--primary" href="/search">
              Clear filters
            </Link>
          </div>
        </section>
      )}

      {result.pageInfo.hasNext && result.pageInfo.nextCursor ? (
        <nav className="search-pagination" aria-label="Result pages">
          <Link
            className="ui-button ui-button--secondary"
            href={buildSearchHref(result.criteria, {
              cursor: result.pageInfo.nextCursor,
            })}
          >
            Next results
            <Icon name="arrow" size={18} />
          </Link>
        </nav>
      ) : null}
    </>
  );
}
