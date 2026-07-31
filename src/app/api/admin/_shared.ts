import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { AdminApplicationError } from "@/modules/admin";
import {
  AuthenticationError,
  AuthenticationServiceUnavailableError,
  AuthorizationError,
  RateLimitExceededError,
} from "@/modules/auth";
import { getTrustedApplicationUrls } from "@/platform/config/application-url";
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

  if (error instanceof ZodError || error instanceof SyntaxError) {
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
  } else if (error instanceof AdminApplicationError) {
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
