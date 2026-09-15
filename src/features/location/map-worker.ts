import { getVersion, setWorkerUrl } from "maplibre-gl";

export function configureMapWorker(): void {
  setWorkerUrl(`/maplibre/${getVersion()}/maplibre-gl-worker.mjs`);
}
