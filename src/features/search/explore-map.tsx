"use client";

import { useEffect, useRef, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map, MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { configuredMapStyle } from "@/features/location/map-style";
import { configureMapWorker } from "@/features/location/map-worker";
import {
  createMapLoadMonitor,
  mapStyleHost,
  type SafeMapDiagnostic,
} from "@/features/location/map-loading";
import type { PublicMapMarkerProjection } from "@/modules/public-search/client";
import {
  BAKERSFIELD_MAP_BOUNDS,
  searchBoundsForViewport,
  type SearchMapBounds,
} from "./map-bounds";
import {
  approximateAreaData,
  markerData,
  saleLocationLayers,
} from "./map-marker-data";

const BAKERSFIELD_CENTER: [number, number] = [-119.018_712, 35.373_292];

export default function ExploreMap({
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
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const selectedIdRef = useRef(selectedId);
  const markersRef = useRef(markers);
  const onSelectRef = useRef(onSelect);
  const onViewportChangeRef = useRef(onViewportChange);
  const initialBoundsRef = useRef(initialBounds);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    markersRef.current = markers;
    onSelectRef.current = onSelect;
    onViewportChangeRef.current = onViewportChange;
    const source = mapRef.current?.getSource<GeoJSONSource>("sale-markers");
    source?.setData(markerData(markers));
    mapRef.current
      ?.getSource<GeoJSONSource>("sale-areas")
      ?.setData(approximateAreaData(markers));
  }, [markers, onSelect, onViewportChange]);

  useEffect(() => {
    if (!container.current) return;
    configureMapWorker();
    const style = configuredMapStyle();
    let disposed = false;
    let map: Map;
    try {
      map = new maplibregl.Map({
        container: container.current,
        style,
        center: BAKERSFIELD_CENTER,
        zoom: 10.5,
        maxBounds: BAKERSFIELD_MAP_BOUNDS,
        cooperativeGestures: false,
        attributionControl: { compact: true },
      });
    } catch {
      // A WebGL initialization failure is synchronous and never reaches the
      // map error event. Keep the list fallback usable on those devices too.
      Sentry.captureMessage("map_render_failure", {
        level: "warning",
        tags: { category: "webgl", host: mapStyleHost(style) ?? "unknown" },
      });
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFailed(true);
      return;
    }
    mapRef.current = map;
    const bounds = initialBoundsRef.current;
    if (bounds)
      map.fitBounds(
        [
          [bounds.west, bounds.south],
          [bounds.east, bounds.north],
        ],
        { animate: false },
      );
    const reportViewport = () => {
      if (disposed) return;
      const viewport = map.getBounds();
      onViewportChangeRef.current(
        searchBoundsForViewport({
          west: viewport.getWest(),
          south: viewport.getSouth(),
          east: viewport.getEast(),
          north: viewport.getNorth(),
        }),
      );
    };
    map.on("moveend", reportViewport);
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
          data: markerData(markersRef.current),
          cluster: true,
          clusterMaxZoom: 13,
          clusterRadius: 48,
        });
        map.addSource("sale-areas", {
          type: "geojson",
          data: approximateAreaData(markersRef.current),
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
        for (const layer of saleLocationLayers(selectedIdRef.current)) {
          map.addLayer(layer);
        }
        const selectableLayers = [
          "sale-points",
          "sale-protected-points",
          "sale-approximate-areas",
        ];
        for (const layer of selectableLayers) {
          map.on("mouseenter", layer, () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", layer, () => {
            map.getCanvas().style.cursor = "";
          });
        }
        map.on("click", "sale-clusters", (event: MapLayerMouseEvent) => {
          const feature = map.queryRenderedFeatures(event.point, {
            layers: ["sale-clusters"],
          })[0];
          if (!feature) return;
          const clusterId = feature.properties?.cluster_id as
            number | undefined;
          if (clusterId === undefined) return;
          const source = map.getSource("sale-markers") as GeoJSONSource;
          void source
            .getClusterExpansionZoom(clusterId)
            .then((zoom) => {
              if (!disposed && feature.geometry.type === "Point") {
                map.easeTo({
                  center: feature.geometry.coordinates as [number, number],
                  zoom,
                });
              }
            })
            .catch(() => {
              // A refreshed source can discard a cluster while the worker is
              // calculating its expansion. Leave the current viewport usable.
            });
        });
        map.on("click", (event) => {
          const feature = map.queryRenderedFeatures(event.point, {
            layers: [...selectableLayers, "sale-clusters"],
          })[0];
          if (!feature) onSelectRef.current(null);
          else if (feature.layer.id !== "sale-clusters") {
            // An exact pin can overlap a protected area. Select only the
            // topmost feature, so the circle underneath cannot steal its click.
            const id = feature.properties?.id as string | undefined;
            if (id) onSelectRef.current(id);
          }
        });
        reportViewport();
      },
      onFallback: () => {
        setFailed(true);
        disposed = true;
        mapRef.current = null;
        map.remove();
      },
      onDiagnostic: reportDiagnostic,
    });
    map.on("error", monitor.error);
    map.once("style.load", monitor.styleLoaded);
    // Idle confirms the current style's sources finished loading. A hardcoded
    // source name incorrectly times out custom and deterministic test styles.
    map.on("idle", monitor.basemapLoaded);
    monitor.start();
    return () => {
      monitor.dispose();
      mapRef.current = null;
      if (!disposed) map.remove();
      disposed = true;
    };
  }, []);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    const map = mapRef.current;
    if (!map?.getLayer("sale-points")) return;
    for (const layer of saleLocationLayers(selectedId)) {
      for (const [property, value] of Object.entries(layer.paint ?? {})) {
        map.setPaintProperty(
          layer.id,
          property as Parameters<Map["setPaintProperty"]>[1],
          value,
        );
      }
    }
  }, [selectedId]);

  useEffect(() => {
    if (active) mapRef.current?.resize();
  }, [active]);

  return (
    <section className="explore-map" aria-label="Interactive sale map">
      <div ref={container} className="explore-map__canvas" hidden={failed} />
      {failed ? (
        <div className="explore-map__failure" role="alert">
          <strong>The map could not load.</strong>
          <span>List View remains available with the same sale results.</span>
          <button type="button" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      ) : null}
      <div className="explore-map__keyboard-markers" aria-label="Map results">
        {markers.map((marker) => (
          <button
            key={marker.resultKey}
            type="button"
            aria-pressed={selectedId === marker.resultKey}
            onClick={() => onSelect(marker.resultKey)}
          >
            Show {marker.title} on the map
            {marker.markerKind !== "exact" ? " (approximate location)" : ""}
          </button>
        ))}
      </div>
    </section>
  );
}
