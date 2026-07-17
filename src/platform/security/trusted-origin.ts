export class TrustedOriginError extends Error {
  override readonly name = "TrustedOriginError";
}

export function assertTrustedOrigin(
  request: Request,
  applicationUrl: URL,
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

  if (origin.origin !== applicationUrl.origin) {
    throw new TrustedOriginError("The request origin is not trusted");
  }
}
