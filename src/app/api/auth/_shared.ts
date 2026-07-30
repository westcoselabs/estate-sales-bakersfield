import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  AuthenticationError,
  AuthenticationServiceUnavailableError,
  AuthorizationError,
  EmailVerificationRequiredError,
  InvalidCredentialsError,
  InvalidPasswordError,
  InvalidTokenError,
  MalformedPasswordHashError,
  RateLimitExceededError,
} from "@/modules/auth";
import { getTrustedApplicationUrls } from "@/platform/config/application-url";
import { logger } from "@/platform/observability/logger";
import { requestIdFrom } from "@/platform/http/request-context";
import {
  assertTrustedOrigin,
  TrustedOriginError,
} from "@/platform/security/trusted-origin";

const noStoreHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
} as const;

const genericInputError = "Please check the submitted information.";

const safeValidationFields = {
  "auth.reset-password": new Set(["password", "passwordConfirmation"]),
  "auth.signup": new Set([
    "displayName",
    "email",
    "password",
    "passwordConfirmation",
  ]),
} as const;

function safeValidationMessage(error: ZodError, operation: string): string {
  const fields =
    safeValidationFields[operation as keyof typeof safeValidationFields];
  if (!fields) return genericInputError;

  const safeIssue = error.issues.find((issue) =>
    fields.has(String(issue.path[0] ?? "")),
  );
  return safeIssue?.message ?? genericInputError;
}

function safePasswordPolicyMessage(
  error: InvalidPasswordError,
  operation: string,
): string {
  return operation === "auth.signup" || operation === "auth.reset-password"
    ? error.message
    : genericInputError;
}

export function assertAuthenticationOrigin(request: Request): void {
  assertTrustedOrigin(request, getTrustedApplicationUrls());
}

export async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new ZodError([]);
  }
  return request.json();
}

export async function waitForMinimumDuration(
  startedAt: number,
  minimumMilliseconds: number,
): Promise<void> {
  const remaining = minimumMilliseconds - (performance.now() - startedAt);
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

export function authJson(
  body: unknown,
  input: {
    readonly status?: number;
    readonly requestId: string;
    readonly headers?: Readonly<Record<string, string>>;
  },
): NextResponse {
  return NextResponse.json(body, {
    status: input.status ?? 200,
    headers: {
      ...noStoreHeaders,
      "X-Request-ID": input.requestId,
      ...input.headers,
    },
  });
}

export function authenticationApiError(
  error: unknown,
  request: Request,
  operation: string,
): NextResponse {
  const requestId = requestIdFrom(request);
  if (
    error instanceof ZodError ||
    error instanceof SyntaxError ||
    error instanceof InvalidPasswordError
  ) {
    const message =
      error instanceof ZodError
        ? safeValidationMessage(error, operation)
        : error instanceof InvalidPasswordError
          ? safePasswordPolicyMessage(error, operation)
          : genericInputError;
    return authJson({ error: message, requestId }, { status: 400, requestId });
  }
  if (error instanceof InvalidTokenError) {
    return authJson(
      { error: "This link is invalid or expired.", requestId },
      { status: 400, requestId },
    );
  }
  if (error instanceof MalformedPasswordHashError) {
    logger.error(
      { requestId, operation, errorType: error.name },
      "Stored authentication credential failed validation",
    );
    return authJson(
      { error: "The request could not be authenticated.", requestId },
      { status: 401, requestId },
    );
  }
  if (
    error instanceof InvalidCredentialsError ||
    error instanceof AuthenticationError
  ) {
    return authJson(
      { error: "The request could not be authenticated.", requestId },
      { status: 401, requestId },
    );
  }
  if (error instanceof EmailVerificationRequiredError) {
    return authJson(
      {
        error: "Verify your email before approving or paying for this event.",
        code: "EMAIL_VERIFICATION_REQUIRED",
        requestId,
      },
      { status: 403, requestId },
    );
  }
  if (error instanceof AuthorizationError) {
    return authJson(
      { error: "You do not have access to this action.", requestId },
      { status: 403, requestId },
    );
  }
  if (error instanceof TrustedOriginError) {
    return authJson(
      { error: "The request origin was rejected.", requestId },
      { status: 403, requestId },
    );
  }
  if (error instanceof RateLimitExceededError) {
    logger.warn(
      { requestId, operation, retryAfterSeconds: error.retryAfterSeconds },
      "Authentication request rate limited",
    );
    return authJson(
      { error: "Please wait before trying again.", requestId },
      {
        status: 429,
        requestId,
        headers: {
          "Retry-After": String(error.retryAfterSeconds),
        },
      },
    );
  }
  if (error instanceof AuthenticationServiceUnavailableError) {
    return authJson(
      { error: "Authentication is temporarily unavailable.", requestId },
      { status: 503, requestId },
    );
  }

  logger.error(
    {
      requestId,
      operation,
      errorType: error instanceof Error ? error.name : "UnknownError",
    },
    "Unexpected authentication request failure",
  );
  return authJson(
    {
      error: "An unexpected error occurred.",
      requestId,
    },
    { status: 500, requestId },
  );
}
