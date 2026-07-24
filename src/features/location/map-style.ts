import type { StyleSpecification } from "maplibre-gl";

export const OPEN_FREE_MAP_LIBERTY_STYLE_URL =
  "https://tiles.openfreemap.org/styles/liberty";
export const TEST_MAP_STYLE_URL = "https://map-style.test.invalid/fixture";

const TEST_MAP_STYLE: StyleSpecification = {
  version: 8,
  name: "Deterministic test map",
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#f1eee5" },
    },
  ],
};

export function configuredMapStyle(): string | StyleSpecification {
  const configured = process.env.NEXT_PUBLIC_MAP_STYLE_URL;
  return configured === TEST_MAP_STYLE_URL
    ? TEST_MAP_STYLE
    : configured || OPEN_FREE_MAP_LIBERTY_STYLE_URL;
}
