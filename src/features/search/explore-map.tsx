"use client";

import { useEffect, useRef, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map, MapLayerMouseEvent } from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";

import { configuredMapStyle } from "@/features/location/map-style";
import {
  createMapLoadMonitor,
  mapStyleHost,
  type SafeMapDiagnostic,
} from "@/features/location/map-loading";
import type { PublicMapMarkerProjection } from "@/modules/public-search/client";

const BAKERSFIELD_CENTER: [number, number] = [-119.018_712, 35.373_292];
const BAKERSFIELD_MAX_BOUNDS: [[number, number], [number, number]] = [
  [-119.45, 35.05],
  [-118.65, 35.75],
];

export default function ExploreMap({
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
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const selectedIdRef = useRef(selectedId);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!container.current) return;
    const data: FeatureCollection<Point> = {
      type: "FeatureCollection",
      features: markers.map((marker) => ({
        type: "Feature",
        id: marker.id,
        properties: {
          id: marker.id,
          markerKind: marker.markerKind,
        },
        geometry: {
          type: "Point",
          coordinates: [...marker.geometry.coordinates],
        },
      })),
    };
    const style = configuredMapStyle();
    const map = new maplibregl.Map({
      container: container.current,
      style,
      center: BAKERSFIELD_CENTER,
      zoom: 10.5,
      maxBounds: BAKERSFIELD_MAX_BOUNDS,
      cooperativeGestures: false,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
      }),
      "top-right",
    );

    const reportDiagnostic = ({ category, host }: SafeMapDiagnostic) => {
      const details = { category, host: host ?? "unknown" };
      console.warn("map_render_failure", details);
      Sentry.captureMessage("map_render_failure", {
        level: "warning",
        tags: details,
      });
    };
    const monitor = createMapLoadMonitor({
      styleHost: mapStyleHost(style),
      onStyleReady: () => {
        map.addSource("sale-markers", {
          type: "geojson",
          data,
          cluster: true,
          clusterMaxZoom: 13,
          clusterRadius: 48,
        });
        map.addLayer({
          id: "sale-clusters",
          type: "circle",
          source: "sale-markers",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#173a2d",
            "circle-radius": [
              "step",
              ["get", "point_count"],
              20,
              10,
              25,
              20,
              30,
            ],
            "circle-stroke-width": 3,
            "circle-stroke-color": "#fffaf1",
          },
        });
        map.addLayer({
          id: "sale-cluster-count",
          type: "symbol",
          source: "sale-markers",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-size": 14,
          },
          paint: { "text-color": "#ffffff" },
        });
        map.addLayer({
          id: "sale-points",
          type: "circle",
          source: "sale-markers",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": "#b97917",
            "circle-radius": [
              "case",
              ["==", ["get", "id"], selectedIdRef.current ?? ""],
              13,
              10,
            ],
            "circle-stroke-width": [
              "case",
              ["==", ["get", "id"], selectedIdRef.current ?? ""],
              4,
              3,
            ],
            "circle-stroke-color": [
              "case",
              ["==", ["get", "id"], selectedIdRef.current ?? ""],
              "#173a2d",
              "#ffffff",
            ],
          },
        });
        map.on("click", "sale-points", (event: MapLayerMouseEvent) => {
          const id = event.features?.[0]?.properties?.id as string | undefined;
          if (id) onSelect(id);
        });
        map.on("click", "sale-clusters", (event: MapLayerMouseEvent) => {
          const feature = map.queryRenderedFeatures(event.point, {
            layers: ["sale-clusters"],
          })[0];
          if (!feature) return;
          const clusterId = feature.properties?.cluster_id as
            number | undefined;
          if (clusterId === undefined) return;
          const source = map.getSource("sale-markers") as GeoJSONSource;
          void source.getClusterExpansionZoom(clusterId).then((zoom) => {
            if (feature.geometry.type === "Point") {
              map.easeTo({
                center: feature.geometry.coordinates as [number, number],
                zoom,
              });
            }
          });
        });
        map.on("click", (event) => {
          const feature = map.queryRenderedFeatures(event.point, {
            layers: ["sale-points", "sale-clusters"],
          })[0];
          if (!feature) onSelect(null);
        });
        map.on("mouseenter", "sale-points", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "sale-points", () => {
          map.getCanvas().style.cursor = "";
        });
      },
      onFallback: () => setFailed(true),
      onDiagnostic: reportDiagnostic,
    });
    map.on("error", monitor.error);
    map.once("style.load", monitor.styleLoaded);
    map.on("sourcedata", (event) => {
      if (event.sourceId === "openmaptiles" && event.isSourceLoaded) {
        monitor.basemapLoaded();
      }
    });
    monitor.start();
    return () => {
      monitor.dispose();
      mapRef.current = null;
      map.remove();
    };
  }, [markers, onSelect]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    const map = mapRef.current;
    if (!map?.getLayer("sale-points")) return;
    map.setPaintProperty("sale-points", "circle-radius", [
      "case",
      ["==", ["get", "id"], selectedId ?? ""],
      13,
      10,
    ]);
    map.setPaintProperty("sale-points", "circle-stroke-width", [
      "case",
      ["==", ["get", "id"], selectedId ?? ""],
      4,
      3,
    ]);
    map.setPaintProperty("sale-points", "circle-stroke-color", [
      "case",
      ["==", ["get", "id"], selectedId ?? ""],
      "#173a2d",
      "#ffffff",
    ]);
  }, [selectedId]);

  useEffect(() => {
    if (active) mapRef.current?.resize();
  }, [active]);

  if (failed) {
    return (
      <div className="explore-map__failure" role="alert">
        <strong>The map could not load.</strong>
        <span>List View remains available with the same sale results.</span>
        <button type="button" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <section className="explore-map" aria-label="Interactive sale map">
      <div ref={container} className="explore-map__canvas" />
      <div className="explore-map__keyboard-markers" aria-label="Map results">
        {markers.map((marker) => (
          <button
            key={marker.id}
            type="button"
            aria-pressed={selectedId === marker.id}
            onClick={() => onSelect(marker.id)}
          >
            Show {marker.title} on the map
          </button>
        ))}
      </div>
    </section>
  );
}
