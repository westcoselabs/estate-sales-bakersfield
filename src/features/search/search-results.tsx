"use client";

import { useState } from "react";
import Link from "next/link";

import { Icon } from "@/components/ui/icons";
import {
  buildSearchHref,
  type PublicSearchCriteria,
  type PublicSearchIssue,
  type PublicSearchPage,
} from "@/modules/public-search/client";

import { ExploreMapLoader } from "./explore-map-loader";
import { ListingCard } from "./listing-card";

function MapResults({
  result,
  active,
}: {
  readonly result: PublicSearchPage;
  readonly active: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedMarker =
    result.markers?.find((marker) => marker.resultKey === selectedId) ?? null;
  const selectedListing =
    result.items.find((listing) => listing.resultKey === selectedId) ?? null;
  const effectiveSelectedId = selectedMarker ? selectedId : null;

  return (
    <div className="explore-map-stage">
      <ExploreMapLoader
        markers={result.markers ?? []}
        selectedId={effectiveSelectedId}
        active={active}
        onSelect={setSelectedId}
      />
      {result.items.length === 0 ? <ExploreEmptyState compact /> : null}
      {selectedListing && selectedMarker ? (
        <div className="explore-map-preview">
          <ListingCard
            listing={selectedListing}
            marker={selectedMarker}
            variant="preview"
            priority
            onDismiss={() => setSelectedId(null)}
          />
        </div>
      ) : null}
    </div>
  );
}

function ExploreEmptyState({
  onClear,
  compact = false,
}: {
  readonly onClear?: () => void;
  readonly compact?: boolean;
}) {
  return (
    <section
      className={`search-state search-state--empty${compact ? " search-state--map" : ""}`}
    >
      <span aria-hidden="true">
        <Icon name="search" size={28} />
      </span>
      <div>
        <h2>No sales found for this search yet.</h2>
        <p>Clear the current filters to see all upcoming Bakersfield sales.</p>
        {onClear ? (
          <button
            className="ui-button ui-button--primary"
            type="button"
            onClick={onClear}
          >
            Clear filters
          </button>
        ) : (
          <Link className="ui-button ui-button--primary" href="/search">
            Clear filters
          </Link>
        )}
      </div>
    </section>
  );
}

export function SearchResults({
  result,
  issue,
  criteria,
  view,
  mapVisited,
  onClear,
}: {
  readonly result: PublicSearchPage | null;
  readonly issue?: PublicSearchIssue | null | undefined;
  readonly criteria: PublicSearchCriteria;
  readonly view: "map" | "list";
  readonly mapVisited: boolean;
  readonly onClear: () => void;
}) {
  if (issue) {
    return (
      <section className="search-state search-state--error" role="alert">
        <Icon name="warning" size={26} />
        <div>
          <h2>Check your search filters</h2>
          <p>{issue.message}</p>
          <button
            className="ui-button ui-button--secondary"
            type="button"
            onClick={onClear}
          >
            Clear filters
          </button>
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
          <p>Try again. Your current search filters are still in the URL.</p>
          <button
            className="ui-button ui-button--secondary"
            type="button"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="explore-results-views">
      <div
        className="explore-results-view explore-results-view--map"
        hidden={view !== "map"}
      >
        {mapVisited ? (
          <MapResults result={result} active={view === "map"} />
        ) : null}
      </div>
      <div
        className="explore-results-view explore-results-view--list"
        hidden={view !== "list"}
      >
        {result.items.length > 0 ? (
          <div className="explore-list" aria-label="Sale results">
            {result.items.map((listing, index) => (
              <ListingCard
                key={listing.resultKey}
                listing={listing}
                marker={result.markers?.find(
                  (marker) => marker.resultKey === listing.resultKey,
                )}
                priority={index === 0}
              />
            ))}
          </div>
        ) : (
          <ExploreEmptyState onClear={onClear} />
        )}
        {result.pageInfo.hasNext && result.pageInfo.nextCursor ? (
          <nav className="search-pagination" aria-label="Result pages">
            <Link
              className="ui-button ui-button--secondary"
              href={buildSearchHref(
                { ...criteria, view },
                { cursor: result.pageInfo.nextCursor },
              )}
            >
              Next results
              <Icon name="arrow" size={18} />
            </Link>
          </nav>
        ) : null}
      </div>
    </div>
  );
}
