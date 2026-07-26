"use client";

import dynamic from "next/dynamic";

import type { PublicMapMarkerProjection } from "@/modules/public-search/client";

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
}: {
  readonly markers: readonly PublicMapMarkerProjection[];
  readonly selectedId: string | null;
  readonly active: boolean;
  readonly onSelect: (id: string | null) => void;
}) {
  return (
    <ExploreMap
      markers={markers}
      selectedId={selectedId}
      active={active}
      onSelect={onSelect}
    />
  );
}
