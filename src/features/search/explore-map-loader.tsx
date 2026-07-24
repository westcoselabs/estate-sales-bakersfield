"use client";

import dynamic from "next/dynamic";

import type { PublicMapMarkerProjection } from "@/modules/public-search";

const ExploreMap = dynamic(() => import("./explore-map"), {
  ssr: false,
  loading: () => (
    <div className="explore-map__loading" role="status">
      Loading interactive map...
    </div>
  ),
});

export function ExploreMapLoader({
  markers,
  selectedId,
  onSelect,
}: {
  readonly markers: readonly PublicMapMarkerProjection[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string | null) => void;
}) {
  return (
    <ExploreMap markers={markers} selectedId={selectedId} onSelect={onSelect} />
  );
}
