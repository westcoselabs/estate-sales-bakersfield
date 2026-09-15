import Link from "next/link";

import { ListingCard } from "@/features/search/listing-card";

import {
  loadSalesHub,
  salesHubHref,
  salesHubs,
  type SalesHubKey,
} from "./sales-hub-data";

export async function SalesHubListings({
  hubKey,
  cursor,
}: {
  readonly hubKey: SalesHubKey;
  readonly cursor: string | null;
}) {
  const result = await loadSalesHub(hubKey, cursor);
  return (
    <section
      className="marketing-section selected-listings"
      aria-labelledby="hub-listings-title"
    >
      <div className="marketing-section__heading">
        <div>
          <h2 id="hub-listings-title">{salesHubs[hubKey].heading}</h2>
          <p>
            Listed in order of sale start time. Check each listing for its
            latest schedule.
          </p>
        </div>
        {cursor ? (
          <Link href={salesHubHref(hubKey)}>Back to first results</Link>
        ) : null}
      </div>
      {result.items.length ? (
        <div className="market-listing-grid">
          {result.items.map((listing, index) => (
            <ListingCard
              key={listing.resultKey}
              listing={listing}
              priority={index === 0}
            />
          ))}
        </div>
      ) : (
        <div className="marketing-listing-state">
          <div>
            <h3>No matching sales are currently published</h3>
            <p>
              New listings appear as organizers publish them and external
              listings are reviewed. Browse upcoming sales for more dates.
            </p>
            <Link
              className="ui-button ui-button--primary"
              href="/search?view=list"
            >
              Browse all upcoming sales
            </Link>
          </div>
        </div>
      )}
      {result.pageInfo.hasNext && result.pageInfo.nextCursor ? (
        <nav className="search-pagination" aria-label="Sale result pages">
          <Link
            className="ui-button ui-button--secondary"
            href={salesHubHref(hubKey, result.pageInfo.nextCursor)}
          >
            Next sales
          </Link>
        </nav>
      ) : null}
    </section>
  );
}
