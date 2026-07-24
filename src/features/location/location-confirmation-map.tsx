"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { configuredMapStyle } from "./map-style";

export default function LocationConfirmationMap({
  latitude,
  longitude,
  label,
}: {
  readonly latitude: number;
  readonly longitude: number;
  readonly label: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: configuredMapStyle(),
      center: [longitude, latitude],
      zoom: 15,
      cooperativeGestures: true,
      attributionControl: { compact: false },
    });
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    const markerElement = document.createElement("span");
    markerElement.className = "location-confirmation-marker";
    markerElement.setAttribute("aria-label", label);
    new maplibregl.Marker({
      element: markerElement,
      draggable: false,
      anchor: "bottom",
    })
      .setLngLat([longitude, latitude])
      .addTo(map);
    map.on("error", () => setFailed(true));
    return () => map.remove();
  }, [label, latitude, longitude]);

  if (failed) {
    return (
      <div className="location-map-fallback" role="status">
        The map could not load. Your selected address is still available for
        review.
      </div>
    );
  }

  return (
    <div
      ref={container}
      className="location-confirmation-map"
      role="region"
      aria-label={`Map showing the selected sale property at ${label}`}
    />
  );
}
