import type { PublicSearchCriteria } from "@/modules/public-search/client";

export type SearchMapBounds = NonNullable<PublicSearchCriteria["bounds"]>;

export const BAKERSFIELD_MAP_BOUNDS: [[number, number], [number, number]] = [
  [-119.45, 35.05],
  [-118.65, 35.75],
];

// Keep area searches broad enough for the server's location privacy policy,
// including when the viewport is zoomed in or crosses the service boundary.
export function searchBoundsForViewport(
  bounds: SearchMapBounds,
): SearchMapBounds {
  function range(low: number, high: number, minimum: number, maximum: number) {
    const span = Math.min(maximum - minimum, Math.max(0.05002, high - low));
    const start = Math.max(
      minimum,
      Math.min(maximum - span, (low + high - span) / 2),
    );
    return [
      Number(start.toFixed(5)),
      Number((start + span).toFixed(5)),
    ] as const;
  }
  const [west, east] = range(bounds.west, bounds.east, -119.45, -118.65);
  const [south, north] = range(bounds.south, bounds.north, 35.05, 35.75);
  return { west, south, east, north };
}
