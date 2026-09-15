// A protected location represents a whole fixed neighborhood cell. Never center
// its public marker or area on the private coordinates: a circle alone would
// still reveal the house at its center.
export const APPROXIMATE_LOCATION_GRID_SCALE = 100;
export const APPROXIMATE_LOCATION_RADIUS_METERS = 750;
export const PUBLIC_ZONE_RADIUS_METERS = 10_000;

export function approximateLocationCoordinates(
  longitude: number,
  latitude: number,
): readonly [longitude: number, latitude: number] {
  const snap = (value: number) =>
    (Math.floor(value * APPROXIMATE_LOCATION_GRID_SCALE) * 10 + 5) / 1000;
  return [snap(longitude), snap(latitude)];
}
