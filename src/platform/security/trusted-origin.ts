export class TrustedOriginError extends Error {
  override readonly name = "TrustedOriginError";
}

export function assertTrustedOrigin(
  request: Request,
  applicationUrls: URL | readonly URL[],
): void {
  const originHeader = request.headers.get("origin");
  if (!originHeader) {
    throw new TrustedOriginError("A trusted Origin header is required");
  }

  let origin: URL;
  try {
    origin = new URL(originHeader);
  } catch {
    throw new TrustedOriginError("The Origin header is invalid");
  }

  const trustedOrigins =
    applicationUrls instanceof URL
      ? [applicationUrls.origin]
      : applicationUrls.map((url) => url.origin);
  if (!trustedOrigins.includes(origin.origin)) {
    throw new TrustedOriginError("The request origin is not trusted");
  }
}
