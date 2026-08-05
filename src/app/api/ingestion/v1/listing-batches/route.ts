import { NextResponse } from "next/server";

import {
  createConfiguredListingImportService,
  createConfiguredListingIngestionCredentialService,
  createConfiguredListingIngestionRateLimit,
  ListingImportConflictError,
  ListingImportError,
  listingImportEnvelopeSchema,
  sha256Digest,
  type ListingImportService,
  type ListingIngestionCredentialService,
  type ListingIngestionRateLimit,
} from "@/modules/listing-imports";
import {
  AuthenticationServiceUnavailableError,
  RateLimitExceededError,
} from "@/modules/auth";
import {
  BoundedBodyError,
  readBoundedText,
} from "@/platform/http/bounded-body";
import { requestIdFrom } from "@/platform/http/request-context";
import { logger } from "@/platform/observability/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const IDEMPOTENCY_KEY_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:-]{6,98}[A-Za-z0-9]$/u;

const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Content-Type": "application/json",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
} as const;

export interface ListingIngestionRouteDependencies {
  readonly credentials: Pick<ListingIngestionCredentialService, "authenticate">;
  readonly imports: Pick<ListingImportService, "importBatch">;
  readonly rateLimit: Pick<
    ListingIngestionRateLimit,
    "assertNetworkAllowed" | "assertCredentialAllowed"
  >;
}

function ingestionJson(
  body: unknown,
  input: {
    readonly requestId: string;
    readonly status: number;
    readonly retryAfterSeconds?: number;
  },
): NextResponse {
  return NextResponse.json(body, {
    status: input.status,
    headers: {
      ...responseHeaders,
      "X-Request-ID": input.requestId,
      ...(input.retryAfterSeconds === undefined
        ? {}
        : { "Retry-After": String(input.retryAfterSeconds) }),
    },
  });
}

function ingestionError(
  requestId: string,
  status: number,
  code: string,
  message: string,
  retryAfterSeconds?: number,
): NextResponse {
  return ingestionJson(
    {
      schema: "listing-import-error.v1",
      error: { code, message },
      requestId,
    },
    {
      requestId,
      status,
      ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
    },
  );
}

function mediaTypeFrom(request: Request): string {
  return (request.headers.get("content-type") ?? "")
    .split(";", 1)[0]!
    .trim()
    .toLowerCase();
}

function bearerTokenFrom(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer ([^\s]+)$/iu);
  return match?.[1] ?? null;
}

function validIdempotencyKeyFrom(request: Request): string | null {
  const value = request.headers.get("idempotency-key");
  return value && IDEMPOTENCY_KEY_PATTERN.test(value) ? value : null;
}

function listingImportFailure(
  error: unknown,
  requestId: string,
  startedAt: number,
): NextResponse {
  let status = 503;
  let code = "SERVICE_UNAVAILABLE";
  let message = "Listing ingestion is temporarily unavailable.";
  let retryAfterSeconds: number | undefined;

  if (error instanceof BoundedBodyError) {
    status = error.code === "PAYLOAD_TOO_LARGE" ? 413 : 400;
    code = error.code;
    message =
      error.code === "PAYLOAD_TOO_LARGE"
        ? "The request body exceeds the one-mebibyte limit."
        : "The request body is invalid.";
  } else if (error instanceof SyntaxError) {
    status = 400;
    code = "INVALID_JSON";
    message = "The request body must contain valid JSON.";
  } else if (error instanceof ListingImportConflictError) {
    status = 409;
    code = error.code;
    message =
      "The idempotency key or run identity conflicts with an existing batch.";
  } else if (error instanceof ListingImportError) {
    if (error.code === "ACTOR_TRANSPORT_MISMATCH") {
      status = 401;
      code = "INVALID_CREDENTIAL";
      message = "The ingestion credential is invalid.";
    } else {
      const unavailableSource = [
        "SOURCE_NOT_FOUND",
        "SOURCE_DISABLED",
        "SOURCE_NOT_PRODUCTION_ALLOWED",
      ].includes(error.code);
      status = unavailableSource ? 403 : 400;
      code = unavailableSource ? "SOURCE_NOT_ALLOWED" : error.code;
      message = unavailableSource
        ? "The authenticated credential cannot submit this source."
        : "The listing import envelope is invalid.";
    }
  } else if (error instanceof RateLimitExceededError) {
    status = 429;
    code = "RATE_LIMITED";
    message = "Please wait before submitting another batch.";
    retryAfterSeconds = error.retryAfterSeconds;
  } else if (error instanceof AuthenticationServiceUnavailableError) {
    status = 503;
    code = "SERVICE_UNAVAILABLE";
  }

  const log =
    status >= 500 ? logger.error.bind(logger) : logger.info.bind(logger);
  log(
    {
      requestId,
      operation: "ingestion.listing-batches.create",
      result: code,
      status,
      durationMs: Math.round(performance.now() - startedAt),
      errorType: error instanceof Error ? error.name : "UnknownError",
    },
    "Listing ingestion request completed",
  );
  return ingestionError(requestId, status, code, message, retryAfterSeconds);
}

export async function handleListingIngestionRequest(
  request: Request,
  dependencies: ListingIngestionRouteDependencies,
): Promise<NextResponse> {
  const startedAt = performance.now();
  const requestId = requestIdFrom(request);

  try {
    await dependencies.rateLimit.assertNetworkAllowed(request);

    if (mediaTypeFrom(request) !== "application/json") {
      return ingestionError(
        requestId,
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "Content-Type must be application/json.",
      );
    }

    const credential = await dependencies.credentials.authenticate(
      bearerTokenFrom(request),
    );
    if (!credential) {
      return ingestionError(
        requestId,
        401,
        "INVALID_CREDENTIAL",
        "The ingestion credential is invalid.",
      );
    }
    await dependencies.rateLimit.assertCredentialAllowed(
      credential.credentialId,
    );

    const idempotencyKey = validIdempotencyKeyFrom(request);
    if (!idempotencyKey) {
      return ingestionError(
        requestId,
        400,
        "INVALID_IDEMPOTENCY_KEY",
        "A valid Idempotency-Key header is required.",
      );
    }

    const bodyText = await readBoundedText(request);
    const input: unknown = JSON.parse(bodyText);
    const envelope = listingImportEnvelopeSchema.safeParse(input);
    if (envelope.success && envelope.data.sourceKey !== credential.source.key) {
      return ingestionError(
        requestId,
        403,
        "SOURCE_MISMATCH",
        "The authenticated credential cannot submit this source.",
      );
    }

    const result = await dependencies.imports.importBatch(input, {
      transport: "API",
      actor: {
        kind: "API_CREDENTIAL",
        credentialId: credential.credentialId,
        idempotencyKeyDigest: sha256Digest(idempotencyKey),
      },
      requestDigest: sha256Digest(bodyText),
      audit: { requestId },
    });

    return ingestionJson(result, {
      requestId,
      status: result.replayed ? 200 : 201,
    });
  } catch (error) {
    return listingImportFailure(error, requestId, startedAt);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const startedAt = performance.now();
  const requestId = requestIdFrom(request);
  try {
    return await handleListingIngestionRequest(request, {
      credentials: createConfiguredListingIngestionCredentialService(),
      imports: createConfiguredListingImportService(),
      rateLimit: createConfiguredListingIngestionRateLimit(),
    });
  } catch (error) {
    return listingImportFailure(error, requestId, startedAt);
  }
}
