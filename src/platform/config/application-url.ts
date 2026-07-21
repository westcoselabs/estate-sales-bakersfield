import { getServerEnvironment } from "./env";

const VERCEL_HOST_PATTERN = /^[a-z0-9.-]+\.vercel\.app$/i;

export function getServerApplicationUrl(
  systemEnvironment: NodeJS.ProcessEnv = process.env,
): URL {
  const environment = getServerEnvironment();
  if (environment.APP_ENV === "preview") {
    const previewHost = systemEnvironment.VERCEL_URL;
    if (previewHost && VERCEL_HOST_PATTERN.test(previewHost)) {
      return new URL(`https://${previewHost}`);
    }
    throw new Error(
      "VERCEL_URL must identify the active Preview deployment host",
    );
  }
  return new URL(environment.APP_URL);
}
