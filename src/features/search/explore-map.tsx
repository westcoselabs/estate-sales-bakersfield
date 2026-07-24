"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import type { PublicMapMarkerProjection } from "@/modules/public-search";

const BAKERSFIELD_CENTER: [number, number] = [-119.018_712, 35.373_292];
const BAKERSFIELD_MAX_BOUNDS: [[number, number], [number, number]] = [
  [-119.45, 35.05],
  [-118.65, 35.75],
];

export default function ExploreMap({
  markers,
  selectedId,
  onSelect,
}: {
  readonly markers: readonly PublicMapMarkerProjection[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string | null) => void;
}) {
  const router = useRouter();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const selectedIdRef = useRef(selectedId);
  const [bounds, setBounds] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const selected = markers.find((marker) => marker.id === selectedId) ?? null;

  useEffect(() => {
    if (!container.current) return;
    const data: FeatureCollection<Point> = {
      type: "FeatureCollection",
      features: markers.map((marker) => ({
        type: "Feature",
        id: marker.id,
        properties: {
          id: marker.id,
          saleType: marker.saleType,
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
      cooperativeGestures: true,
      attributionControl: { compact: false },
    });
    mapRef.current = map;
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    const reportDiagnostic = ({ category, host }: SafeMapDiagnostic) => {
      const details = { category, host: host ?? "unknown" };
      // Deliberately omit provider URLs, coordinates, and error messages.
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
              19,
              10,
              24,
              20,
              29,
            ],
            "circle-stroke-width": 3,
            "circle-stroke-color": "#f7f4ec",
          },
        });
        map.addLayer({
          id: "sale-cluster-count",
          type: "symbol",
          source: "sale-markers",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-size": 13,
          },
          paint: { "text-color": "#ffffff" },
        });
        map.addLayer({
          id: "sale-points",
          type: "circle",
          source: "sale-markers",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": [
              "match",
              ["get", "saleType"],
              "estate",
              "#173a2d",
              "#b97917",
            ],
            "circle-radius": [
              "case",
              ["==", ["get", "id"], selectedIdRef.current ?? ""],
              12,
              9,
            ],
            "circle-stroke-width": 3,
            "circle-stroke-color": "#ffffff",
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
          const clusterId = feature?.properties?.cluster_id as
            number | undefined;
          if (clusterId === undefined) return;
          const source = map.getSource("sale-markers") as GeoJSONSource;
          void source.getClusterExpansionZoom(clusterId).then((zoom) => {
            const geometry = feature.geometry;
            if (geometry.type === "Point") {
              map.easeTo({
                center: geometry.coordinates as [number, number],
                zoom,
              });
            }
          });
        });
        map.on("mouseenter", "sale-points", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "sale-points", () => {
          map.getCanvas().style.cursor = "";
        });
        updateBounds();
        map.on("moveend", updateBounds);
      },
      onFallback: () => setFailed(true),
      onDiagnostic: reportDiagnostic,
    });
    const updateBounds = () => {
      const next = map.getBounds();
      setBounds(
        [next.getWest(), next.getSouth(), next.getEast(), next.getNorth()]
          .map((value) => value.toFixed(5))
          .join(","),
      );
    };
    map.on("error", monitor.error);
    map.once("style.load", monitor.styleLoaded);
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
      12,
      9,
    ]);
  }, [selectedId]);

  function searchArea() {
    if (!bounds) return;
    const parameters = new URLSearchParams(window.location.search);
    parameters.set("view", "map");
    parameters.set("bounds", bounds);
    parameters.delete("cursor");
    router.push(`/search?${parameters.toString()}`, { scroll: false });
  }

  if (failed) {
    return (
      <div className="explore-map__failure" role="status">
        The map could not load. The listing results remain available.
      </div>
    );
  }

  return (
    <section className="explore-map" aria-label="Interactive sale map">
      <div ref={container} className="explore-map__canvas" />
      <button
        className="explore-map__search-area"
        type="button"
        disabled={!bounds}
        onClick={searchArea}
      >
        Search this area
      </button>
      {selected ? (
        <article className="explore-map__preview">
          {/* Public media routes authorize this already projected cover. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={selected.coverPhotoUrl} alt="" width="180" height="130" />
          <div>
            <span>
              {selected.saleType === "estate" ? "Estate sale" : "Yard sale"}
            </span>
            <strong>{selected.title}</strong>
            <small>{selected.locationLabel}</small>
            <span className="explore-map__preview-actions">
              <Link href={selected.href}>View details</Link>
              {selected.markerKind === "exact" ? (
                <a
                  href={`https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=;${String(selected.geometry.coordinates[1])},${String(selected.geometry.coordinates[0])}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Directions
                </a>
              ) : null}
            </span>
          </div>
          <button
            type="button"
            aria-label="Close listing preview"
            onClick={() => onSelect(null)}
          >
            ×
          </button>
        </article>
      ) : null}
    </section>
  );
}
