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
import type { SearchMapBounds } from "./map-bounds";

function MapResults({
  result,
  active,
  criteria,
  pending,
  onNavigate,
}: {
  readonly result: PublicSearchPage;
  readonly active: boolean;
  readonly criteria: PublicSearchCriteria;
  readonly pending: boolean;
  readonly onNavigate: (changes: Partial<PublicSearchCriteria>) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<SearchMapBounds | null>(null);
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
        initialBounds={criteria.bounds ?? null}
        onViewportChange={setViewport}
      />
      <div className="explore-map-actions" aria-label="Map search controls">
        {viewport ? (
          <button
            className="ui-button ui-button--secondary"
            type="button"
            disabled={pending}
            onClick={() => onNavigate({ bounds: viewport, cursor: null })}
          >
            Search this area
          </button>
        ) : null}
        {criteria.bounds ? (
          <button
            className="ui-button ui-button--secondary"
            type="button"
            disabled={pending}
            onClick={() => onNavigate({ bounds: null, cursor: null })}
          >
            All Bakersfield
          </button>
        ) : null}
        <ResultPagination
          result={result}
          criteria={criteria}
          pending={pending}
          onNavigate={onNavigate}
        />
      </div>
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

function ResultPagination({
  result,
  criteria,
  pending,
  onNavigate,
}: {
  readonly result: PublicSearchPage;
  readonly criteria: PublicSearchCriteria;
  readonly pending: boolean;
  readonly onNavigate: (changes: Partial<PublicSearchCriteria>) => void;
}) {
  if (!criteria.cursor && !result.pageInfo.hasNext) return null;
  return (
    <nav
      className="search-pagination"
      aria-label="Result pages"
      aria-busy={pending}
    >
      {criteria.cursor ? (
        <Link
          className="ui-button ui-button--secondary"
          href={buildSearchHref(criteria, { cursor: null })}
          aria-disabled={pending}
          onNavigate={(event) => {
            event.preventDefault();
            if (!pending) onNavigate({ cursor: null });
          }}
        >
          First results
        </Link>
      ) : null}
      {result.pageInfo.hasNext && result.pageInfo.nextCursor ? (
        <Link
          className="ui-button ui-button--secondary"
          href={buildSearchHref(criteria, {
            cursor: result.pageInfo.nextCursor,
          })}
          aria-disabled={pending}
          onNavigate={(event) => {
            event.preventDefault();
            if (!pending) onNavigate({ cursor: result.pageInfo.nextCursor });
          }}
        >
          Next results <Icon name="arrow" size={18} />
        </Link>
      ) : null}
    </nav>
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
  pending,
  onNavigate,
}: {
  readonly result: PublicSearchPage | null;
  readonly issue?: PublicSearchIssue | null | undefined;
  readonly criteria: PublicSearchCriteria;
  readonly view: "map" | "list";
  readonly mapVisited: boolean;
  readonly onClear: () => void;
  readonly pending: boolean;
  readonly onNavigate: (changes: Partial<PublicSearchCriteria>) => void;
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
          <MapResults
            result={result}
            active={view === "map"}
            criteria={criteria}
            pending={pending}
            onNavigate={onNavigate}
          />
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
        <ResultPagination
          result={result}
          criteria={criteria}
          pending={pending}
          onNavigate={onNavigate}
        />
      </div>
    </div>
  );
}
