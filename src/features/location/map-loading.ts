export const MAP_STYLE_LOAD_TIMEOUT_MS = 12_000;

export type MapFailureCategory =
  | "style"
  | "style-timeout"
  | "source"
  | "tile"
  | "webgl"
  | "network"
  | "unknown";

export type SafeMapDiagnostic = Readonly<{
  category: MapFailureCategory;
  host: string | null;
  hasSourceOrTileContext: boolean;
}>;

type MapErrorLike = Readonly<{
  error?: unknown;
  sourceId?: unknown;
  tile?: unknown;
}>;

type MapLoadMonitorOptions = Readonly<{
  styleHost: string | null;
  onStyleReady: () => void;
  onFallback: (diagnostic: SafeMapDiagnostic) => void;
  onDiagnostic: (diagnostic: SafeMapDiagnostic) => void;
  timeoutMs?: number;
}>;

function recordValue(value: unknown, key: string): unknown {
  return value && typeof value === "object" && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function stringValue(value: unknown, key: string): string | null {
  const candidate = recordValue(value, key);
  return typeof candidate === "string" ? candidate : null;
}

function safeHost(value: string | null): string | null {
  if (!value) return null;
  try {
    const host = new URL(value).host.toLowerCase();
    return /^[a-z0-9.-]{1,253}$/.test(host) ? host : null;
  } catch {
    return null;
  }
}

export function mapStyleHost(style: unknown): string | null {
  return typeof style === "string" ? safeHost(style) : null;
}

export function classifyMapError(event: MapErrorLike): SafeMapDiagnostic {
  const error = event.error;
  const message = stringValue(error, "message")?.toLowerCase() ?? "";
  const host = safeHost(stringValue(error, "url"));
  const hasSourceOrTileContext = Boolean(event.sourceId || event.tile);

  const category: MapFailureCategory = /webgl|gpu|context/.test(message)
    ? "webgl"
    : Boolean(event.tile) || /(?:^|[^a-z])tile(?:[^a-z]|$)/.test(message)
      ? "tile"
      : Boolean(event.sourceId) ||
          /(?:^|[^a-z])source(?:[^a-z]|$)/.test(message)
        ? "source"
        : /style|stylesheet|stylejson/.test(message)
          ? "style"
          : /failed to fetch|network|cors|ajax|status/.test(message)
            ? "network"
            : "unknown";

  return { category, host, hasSourceOrTileContext };
}

function sameDiagnostic(
  left: SafeMapDiagnostic,
  right: SafeMapDiagnostic,
): boolean {
  return left.category === right.category && left.host === right.host;
}

export function createMapLoadMonitor({
  styleHost,
  onStyleReady,
  onFallback,
  onDiagnostic,
  timeoutMs = MAP_STYLE_LOAD_TIMEOUT_MS,
}: MapLoadMonitorOptions) {
  let styleReady = false;
  let disposed = false;
  let fallbackShown = false;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const reported: SafeMapDiagnostic[] = [];

  const report = (diagnostic: SafeMapDiagnostic) => {
    if (reported.some((previous) => sameDiagnostic(previous, diagnostic))) {
      return;
    }
    reported.push(diagnostic);
    onDiagnostic(diagnostic);
  };

  const showFallback = (diagnostic: SafeMapDiagnostic) => {
    if (disposed || fallbackShown) return;
    fallbackShown = true;
    if (timeout) clearTimeout(timeout);
    report(diagnostic);
    onFallback(diagnostic);
  };

  return {
    start() {
      timeout = setTimeout(() => {
        if (styleReady) return;
        showFallback({
          category: "style-timeout",
          host: styleHost,
          hasSourceOrTileContext: false,
        });
      }, timeoutMs);
    },
    styleLoaded() {
      if (disposed || styleReady) return;
      styleReady = true;
      if (timeout) clearTimeout(timeout);
      onStyleReady();
    },
    error(event: MapErrorLike) {
      const diagnostic = classifyMapError(event);
      report(diagnostic);
      const isStyleInitializationFailure =
        !styleReady &&
        !diagnostic.hasSourceOrTileContext &&
        (diagnostic.category === "style" ||
          diagnostic.category === "webgl" ||
          (diagnostic.category === "network" && diagnostic.host === styleHost));
      if (isStyleInitializationFailure) showFallback(diagnostic);
    },
    dispose() {
      disposed = true;
      if (timeout) clearTimeout(timeout);
    },
  };
}
