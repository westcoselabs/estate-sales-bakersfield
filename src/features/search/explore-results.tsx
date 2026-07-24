"use client";

import { useState } from "react";

import type {
  PublicListingCardProjection,
  PublicMapMarkerProjection,
} from "@/modules/public-search";

import { ExploreMapLoader } from "./explore-map-loader";
import { ListingCard } from "./listing-card";

export function ExploreResults({
  listings,
  markers,
}: {
  readonly listings: readonly PublicListingCardProjection[];
  readonly markers: readonly PublicMapMarkerProjection[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    markers[0]?.id ?? null,
  );
  return (
    <div className="search-explore-layout">
      <div className="search-explore-list" aria-label="Map listing results">
        {listings.map((listing, index) => (
          <div
            key={listing.id}
            data-selected={selectedId === listing.id ? "true" : "false"}
            onMouseEnter={() => setSelectedId(listing.id)}
            onFocusCapture={() => setSelectedId(listing.id)}
          >
            <ListingCard
              listing={listing}
              variant="compact"
              priority={index === 0}
            />
          </div>
        ))}
      </div>
      <ExploreMapLoader
        markers={markers}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
    </div>
  );
}
