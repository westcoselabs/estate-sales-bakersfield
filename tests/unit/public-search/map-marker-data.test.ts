import { describe, expect, it } from "vitest";

import {
  approximateAreaData,
  markerData,
  saleLocationLayers,
} from "@/features/search/map-marker-data";
import { approximateLocationCoordinates } from "@/modules/public-search/domain/approximate-location";
import type { PublicMapMarkerProjection } from "@/modules/public-search/domain/types";

function marker(
  markerKind: PublicMapMarkerProjection["markerKind"],
): PublicMapMarkerProjection {
  return {
    id: "abc123def456",
    sourceKind: "ORGANIZER",
    resultKey: "event:abc123def456",
    sourceLabel: null,
    unclaimed: false,
    href: "/estate-sales/fixture-abc123def456",
    saleType: "estate",
    title: "Neighborhood sale",
    startsAt: "2026-10-04T15:00:00Z",
    endsAt: "2026-10-04T20:00:00Z",
    localStartsAt: "2026-10-04T08:00",
    localEndsAt: "2026-10-04T13:00",
    timezone: "America/Los_Angeles",
    locationLabel: "Bakersfield area",
    coverPhotoUrl: "/images/marketplace-hero.webp",
    geometry: { type: "Point", coordinates: [-119.025, 35.385] },
    markerKind,
    approximateRadiusMeters: 750,
  };
}

describe("protected map locations", () => {
  it("gives nearby houses in one cell exactly the same public center", () => {
    expect(approximateLocationCoordinates(-119.023456, 35.382345)).toEqual([
      -119.025, 35.385,
    ]);
    expect(approximateLocationCoordinates(-119.0299, 35.3899)).toEqual([
      -119.025, 35.385,
    ]);
    expect(approximateLocationCoordinates(-119.0201, 35.3801)).toEqual([
      -119.025, 35.385,
    ]);
  });

  it("draws an enclosing closed area from only the public center and never adds an area to an exact pin", () => {
    const hidden = marker("hidden");
    const area = approximateAreaData([hidden, marker("exact")]);
    expect(area.features).toHaveLength(1);
    const ring = area.features[0]!.geometry.coordinates[0]!;
    expect(ring).toHaveLength(65);
    expect(ring[0]).toEqual(ring.at(-1));
    // The 750 m circle encloses the whole 0.01-degree cell in Bakersfield;
    // all four corners must fit, so its edge cannot indicate a particular home.
    for (const [longitude, latitude] of [
      [-119.03, 35.38],
      [-119.02, 35.38],
      [-119.03, 35.39],
      [-119.02, 35.39],
    ]) {
      const latitudeMeters =
        (((latitude! - 35.385) * Math.PI) / 180) * 6_371_008.8;
      const longitudeMeters =
        (((longitude! + 119.025) * Math.PI) / 180) *
        6_371_008.8 *
        Math.cos((35.385 * Math.PI) / 180);
      expect(Math.hypot(latitudeMeters, longitudeMeters)).toBeLessThan(750);
    }
    expect(Math.max(...ring.map((point) => point[1]!))).toBeGreaterThan(35.39);
    expect(Math.min(...ring.map((point) => point[0]!))).toBeLessThan(-119.03);
    expect(markerData([hidden]).features[0]?.geometry.coordinates).toEqual([
      -119.025, 35.385,
    ]);
  });

  it("replaces protected pins with a filled dashed area at neighborhood zoom, while exact pins remain", () => {
    const layers = saleLocationLayers("event:abc123def456");
    const hiddenPin = layers.find(
      (layer) => layer.id === "sale-protected-points",
    )!;
    const exactPin = layers.find((layer) => layer.id === "sale-points")!;
    const fill = layers.find((layer) => layer.id === "sale-approximate-areas")!;
    const outline = layers.find(
      (layer) => layer.id === "sale-approximate-outlines",
    )!;
    expect(hiddenPin.maxzoom).toBe(14);
    expect(fill.minzoom).toBe(hiddenPin.maxzoom);
    expect(outline.minzoom).toBe(hiddenPin.maxzoom);
    expect(exactPin.maxzoom).toBeUndefined();
    expect(outline.paint).toMatchObject({ "line-dasharray": [3, 2] });
    expect(fill.paint).toMatchObject({ "fill-color": "#d5413a" });
  });
});
