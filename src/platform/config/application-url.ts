import { getServerEnvironment } from "./env";

const VERCEL_HOST_PATTERN = /^[a-z0-9.-]+\.vercel\.app$/i;

function previewUrlFromHost(
  host: string | undefined,
  variableName: string,
): URL {
  if (host && VERCEL_HOST_PATTERN.test(host)) {
    return new URL(`https://${host}`);
  }
  throw new Error(`${variableName} must identify a Vercel Preview host`);
}

export function getServerApplicationUrl(
  systemEnvironment: NodeJS.ProcessEnv = process.env,
): URL {
  const environment = getServerEnvironment();
  if (environment.APP_ENV === "preview") {
    return previewUrlFromHost(systemEnvironment.VERCEL_URL, "VERCEL_URL");
  }
  return new URL(environment.APP_URL);
}

export function getTrustedApplicationUrls(
  systemEnvironment: NodeJS.ProcessEnv = process.env,
): readonly URL[] {
  const applicationUrl = getServerApplicationUrl(systemEnvironment);
  if (getServerEnvironment().APP_ENV !== "preview") {
    return [applicationUrl];
  }

  const urls = new Map<string, URL>([[applicationUrl.origin, applicationUrl]]);
  const branchHost = systemEnvironment.VERCEL_BRANCH_URL;
  if (branchHost) {
    const branchUrl = previewUrlFromHost(branchHost, "VERCEL_BRANCH_URL");
    urls.set(branchUrl.origin, branchUrl);
  }
  return [...urls.values()];
}
