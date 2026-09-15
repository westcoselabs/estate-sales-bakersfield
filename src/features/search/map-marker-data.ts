import type { FeatureCollection, Point, Polygon } from "geojson";
import type {
  CircleLayerSpecification,
  ExpressionSpecification,
  LayerSpecification,
} from "maplibre-gl";

import type { PublicMapMarkerProjection } from "@/modules/public-search/client";

export const APPROXIMATE_AREA_MIN_ZOOM = 14;
const EARTH_RADIUS_METERS = 6_371_008.8;
const RADIANS = Math.PI / 180;

export function markerData(
  markers: readonly PublicMapMarkerProjection[],
): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: markers.map((marker) => ({
      type: "Feature",
      id: marker.resultKey,
      properties: { id: marker.resultKey, markerKind: marker.markerKind },
      geometry: {
        type: "Point",
        coordinates: [...marker.geometry.coordinates],
      },
    })),
  };
}

// These polygons use only the coarse public point and radius sent by search.
// Drawing a circle around a house's exact position would defeat address hiding.
export function approximateAreaData(
  markers: readonly PublicMapMarkerProjection[],
): FeatureCollection<Polygon> {
  return {
    type: "FeatureCollection",
    features: markers
      .filter((marker) => marker.markerKind !== "exact")
      .map((marker) => {
        const [longitude, latitude] = marker.geometry.coordinates;
        const angularRadius =
          (marker.approximateRadiusMeters ?? 750) / EARTH_RADIUS_METERS;
        const centerLatitude = latitude * RADIANS;
        const centerLongitude = longitude * RADIANS;
        const ring = Array.from({ length: 64 }, (_, index) => {
          const bearing = (index / 64) * 2 * Math.PI;
          const edgeLatitude = Math.asin(
            Math.sin(centerLatitude) * Math.cos(angularRadius) +
              Math.cos(centerLatitude) *
                Math.sin(angularRadius) *
                Math.cos(bearing),
          );
          const edgeLongitude =
            centerLongitude +
            Math.atan2(
              Math.sin(bearing) *
                Math.sin(angularRadius) *
                Math.cos(centerLatitude),
              Math.cos(angularRadius) -
                Math.sin(centerLatitude) * Math.sin(edgeLatitude),
            );
          return [edgeLongitude / RADIANS, edgeLatitude / RADIANS];
        });
        ring.push([...ring[0]!]);
        return {
          type: "Feature" as const,
          id: marker.resultKey,
          properties: { id: marker.resultKey, markerKind: marker.markerKind },
          geometry: { type: "Polygon" as const, coordinates: [ring] },
        };
      }),
  };
}

export function saleLocationLayers(
  selectedId: string | null,
): LayerSpecification[] {
  const selected: ExpressionSpecification = [
    "==",
    ["get", "id"],
    selectedId ?? "",
  ];
  const pointPaint: CircleLayerSpecification["paint"] = {
    "circle-color": "#b97917",
    "circle-radius": ["case", selected, 13, 10],
    "circle-stroke-width": ["case", selected, 4, 3],
    "circle-stroke-color": ["case", selected, "#173a2d", "#ffffff"],
  };
  return [
    {
      id: "sale-approximate-areas",
      type: "fill",
      source: "sale-areas",
      minzoom: APPROXIMATE_AREA_MIN_ZOOM,
      paint: {
        "fill-color": "#d5413a",
        "fill-opacity": ["case", selected, 0.22, 0.14],
      },
    },
    {
      id: "sale-approximate-outlines",
      type: "line",
      source: "sale-areas",
      minzoom: APPROXIMATE_AREA_MIN_ZOOM,
      paint: {
        "line-color": "#d5413a",
        "line-width": ["case", selected, 3, 2],
        "line-dasharray": [3, 2],
      },
    },
    {
      id: "sale-points",
      type: "circle",
      source: "sale-markers",
      filter: [
        "all",
        ["!", ["has", "point_count"]],
        ["==", ["get", "markerKind"], "exact"],
      ],
      paint: pointPaint,
    },
    {
      id: "sale-protected-points",
      type: "circle",
      source: "sale-markers",
      maxzoom: APPROXIMATE_AREA_MIN_ZOOM,
      filter: [
        "all",
        ["!", ["has", "point_count"]],
        ["!=", ["get", "markerKind"], "exact"],
      ],
      paint: pointPaint,
    },
  ];
}
