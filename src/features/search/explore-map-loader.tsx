"use client";

import dynamic from "next/dynamic";

import type { PublicMapMarkerProjection } from "@/modules/public-search/client";
import type { SearchMapBounds } from "./map-bounds";

const ExploreMap = dynamic(() => import("./explore-map"), {
  ssr: false,
  loading: () => (
    <div className="explore-map explore-map--loading" role="status">
      <span>Loading nearby sales...</span>
      <span className="explore-map__control-skeleton ui-skeleton" />
      <span className="explore-map__location-skeleton ui-skeleton" />
    </div>
  ),
});

export function ExploreMapLoader({
  markers,
  selectedId,
  active,
  onSelect,
  initialBounds,
  onViewportChange,
}: {
  readonly markers: readonly PublicMapMarkerProjection[];
  readonly selectedId: string | null;
  readonly active: boolean;
  readonly onSelect: (id: string | null) => void;
  readonly initialBounds: SearchMapBounds | null;
  readonly onViewportChange: (bounds: SearchMapBounds) => void;
}) {
  return (
    <ExploreMap
      markers={markers}
      selectedId={selectedId}
      active={active}
      onSelect={onSelect}
      initialBounds={initialBounds}
      onViewportChange={onViewportChange}
    />
  );
}
