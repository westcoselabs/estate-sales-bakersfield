import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { AdminApplicationError } from "@/modules/admin";
import { EmailApplicationError } from "@/modules/email";
import {
  ListingImportConflictError,
  ListingImportError,
  ListingIngestionCredentialError,
  ListingImportReviewError,
} from "@/modules/listing-imports";
import {
  LocationNotFoundError,
  LocationProviderError,
} from "@/modules/locations";
import {
  AuthenticationError,
  AuthenticationServiceUnavailableError,
  AuthorizationError,
  RateLimitExceededError,
} from "@/modules/auth";
import { getTrustedApplicationUrls } from "@/platform/config/application-url";
import {
  BoundedBodyError,
  readBoundedText,
} from "@/platform/http/bounded-body";
import { logger } from "@/platform/observability/logger";
import {
  assertTrustedOrigin,
  TrustedOriginError,
} from "@/platform/security/trusted-origin";

const adminHeaders = {
  "Cache-Control": "private, no-store",
  "Content-Type": "application/json",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
} as const;

export class AdminUnsupportedMediaTypeError extends Error {
  override readonly name = "AdminUnsupportedMediaTypeError";
}

export function assertAdminOrigin(request: Request): void {
  assertTrustedOrigin(request, getTrustedApplicationUrls());
}

export async function readAdminJson(request: Request): Promise<unknown> {
  if (
    !(request.headers.get("content-type") ?? "").includes("application/json")
  ) {
    throw new ZodError([]);
  }
  return request.json();
}

export async function readAdminBoundedJson(request: Request): Promise<unknown> {
  if (
    (request.headers.get("content-type") ?? "")
      .split(";", 1)[0]
      ?.trim()
      .toLowerCase() !== "application/json"
  ) {
    throw new AdminUnsupportedMediaTypeError(
      "Content-Type must be application/json.",
    );
  }
  return JSON.parse(await readBoundedText(request));
}

export function adminJson(
  body: unknown,
  input: {
    requestId: string;
    status?: number;
    headers?: Readonly<Record<string, string>>;
  },
): NextResponse {
  return NextResponse.json(body, {
    status: input.status ?? 200,
    headers: {
      ...adminHeaders,
      "X-Request-ID": input.requestId,
      ...input.headers,
    },
  });
}

export function adminApiError(
  error: unknown,
  requestId: string,
  operation: string,
  startedAt: number,
): NextResponse {
  const durationMs = Math.round(performance.now() - startedAt);
  let status = 500;
  let code = "UNEXPECTED_ERROR";
  let message = "An unexpected error occurred.";
  let retryAfter: string | undefined;

  if (error instanceof BoundedBodyError) {
    status = error.code === "PAYLOAD_TOO_LARGE" ? 413 : 400;
    code = error.code;
    message =
      error.code === "PAYLOAD_TOO_LARGE"
        ? "The request body is too large."
        : "Please check the submitted information.";
  } else if (error instanceof AdminUnsupportedMediaTypeError) {
    status = 415;
    code = "UNSUPPORTED_MEDIA_TYPE";
    message = "The request content type is not supported.";
  } else if (error instanceof ZodError || error instanceof SyntaxError) {
    status = 400;
    code = "INVALID_INPUT";
    message = "Please check the submitted information.";
  } else if (error instanceof AuthenticationError) {
    status = 401;
    code = "AUTHENTICATION_REQUIRED";
    message = "Authentication is required.";
  } else if (
    error instanceof AuthorizationError ||
    error instanceof TrustedOriginError
  ) {
    status = 403;
    code =
      error instanceof TrustedOriginError ? "ORIGIN_REJECTED" : "FORBIDDEN";
    message =
      error instanceof TrustedOriginError
        ? "The request origin was rejected."
        : "You do not have access to this action.";
  } else if (error instanceof RateLimitExceededError) {
    status = 429;
    code = "RATE_LIMITED";
    message = "Please wait before trying again.";
    retryAfter = String(error.retryAfterSeconds);
  } else if (error instanceof AuthenticationServiceUnavailableError) {
    status = 503;
    code = "SERVICE_UNAVAILABLE";
    message = "The service is temporarily unavailable.";
  } else if (error instanceof ListingImportConflictError) {
    status = 409;
    code = error.code;
    message = "The import conflicts with an existing batch.";
  } else if (error instanceof ListingImportError) {
    if (error.code === "ACTOR_TRANSPORT_MISMATCH") {
      status = 403;
      code = "FORBIDDEN";
      message = "You do not have access to this action.";
    } else {
      status = error.code === "SOURCE_NOT_PRODUCTION_ALLOWED" ? 403 : 400;
      code = error.code;
      message = "Please check the listing import information.";
    }
  } else if (error instanceof ListingIngestionCredentialError) {
    if (error.code === "ACTOR_NOT_AUTHORIZED") {
      status = 403;
      code = "FORBIDDEN";
      message = "You do not have access to this action.";
    } else {
      status = error.code === "SOURCE_NOT_PRODUCTION_ALLOWED" ? 403 : 400;
      code = error.code;
      message = "Please check the ingestion credential information.";
    }
  } else if (error instanceof ListingImportReviewError) {
    status = error.status;
    code = error.code;
    message = error.message;
  } else if (error instanceof LocationNotFoundError) {
    status = 422;
    code = "LOCATION_NOT_FOUND";
    message = "The address could not be confirmed.";
  } else if (error instanceof LocationProviderError) {
    status = 503;
    code = "LOCATION_SERVICE_UNAVAILABLE";
    message = "Location confirmation is temporarily unavailable.";
  } else if (error instanceof AdminApplicationError) {
    status = error.status;
    code = error.code;
    message = error.message;
  } else if (error instanceof EmailApplicationError) {
    status = error.status;
    code = error.code;
    message = error.message;
  }

  const log =
    status >= 500 ? logger.error.bind(logger) : logger.info.bind(logger);
  log(
    {
      requestId,
      operation,
      result: code,
      durationMs,
      errorType: error instanceof Error ? error.name : "UnknownError",
    },
    "Admin request completed",
  );

  return adminJson(
    { schema: "admin-error/v1", error: message, code, requestId },
    {
      status,
      requestId,
      ...(retryAfter ? { headers: { "Retry-After": retryAfter } } : {}),
    },
  );
}
