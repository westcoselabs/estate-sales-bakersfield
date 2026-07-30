import { ZodError } from "zod";

import {
  AuthenticationError,
  AuthorizationError,
  EmailVerificationRequiredError,
} from "@/modules/auth";
import {
  EventConflictError,
  EventNotFoundError,
  EventStateError,
  EventValidationError,
  PhotoProcessingError,
} from "@/modules/events";
import {
  LocationNotFoundError,
  LocationProviderError,
} from "@/modules/locations";
import { MediaStoreError } from "@/modules/media";
import { PaymentError } from "@/modules/payments";
import { requestIdFrom } from "@/platform/http/request-context";
import { logger } from "@/platform/observability/logger";
import { TrustedOriginError } from "@/platform/security/trusted-origin";

import { authJson } from "../auth/_shared";

export function eventApiError(
  error: unknown,
  request: Request,
  operation: string,
) {
  const requestId = requestIdFrom(request);
  if (
    error instanceof ZodError ||
    error instanceof SyntaxError ||
    error instanceof EventValidationError
  ) {
    return authJson(
      {
        error:
          error instanceof EventValidationError
            ? error.message
            : "Please check the submitted event information.",
        requestId,
      },
      { status: 400, requestId },
    );
  }
  if (error instanceof AuthenticationError) {
    return authJson(
      { error: "Authentication is required.", requestId },
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
  if (error instanceof EventNotFoundError) {
    return authJson(
      { error: "The event draft was not found.", requestId },
      { status: 404, requestId },
    );
  }
  if (error instanceof EventConflictError) {
    return authJson(
      { error: error.message, code: "STALE_VERSION", requestId },
      { status: 409, requestId },
    );
  }
  if (error instanceof EventStateError) {
    return authJson(
      { error: error.message, requestId },
      { status: 422, requestId },
    );
  }
  if (error instanceof PaymentError) {
    const status =
      error.code === "PAYMENT_CONFIGURATION_UNAVAILABLE" ||
      error.code === "STRIPE_UNAVAILABLE"
        ? 503
        : error.code === "EVENT_NOT_APPROVED" ||
            error.code === "STALE_APPROVAL" ||
            error.code === "INVALID_SCHEDULE" ||
            error.code === "INCOMPLETE_PHOTOS" ||
            error.code === "PAYMENT_MISMATCH"
          ? 422
          : 409;
    return authJson(
      { error: error.message, code: error.code, requestId },
      { status, requestId },
    );
  }
  if (error instanceof PhotoProcessingError) {
    logger.warn(
      {
        requestId,
        operation,
        errorType: error.name,
        processingStage: error.stage,
      },
      "Event photo processing failed",
    );
    return authJson(
      { error: error.message, requestId },
      { status: 422, requestId },
    );
  }
  if (error instanceof LocationNotFoundError) {
    return authJson(
      { error: error.message, requestId },
      { status: 422, requestId },
    );
  }
  if (
    error instanceof LocationProviderError ||
    error instanceof MediaStoreError
  ) {
    logger.warn(
      { requestId, operation, errorType: error.name },
      "Event provider operation failed",
    );
    return authJson(
      {
        error: "This provider operation is temporarily unavailable.",
        requestId,
      },
      { status: 503, requestId },
    );
  }
  if (error instanceof TrustedOriginError) {
    return authJson(
      { error: "The request origin was rejected.", requestId },
      { status: 403, requestId },
    );
  }
  logger.error(
    {
      requestId,
      operation,
      errorType: error instanceof Error ? error.name : "UnknownError",
    },
    "Unexpected event request failure",
  );
  return authJson(
    { error: "An unexpected error occurred.", requestId },
    { status: 500, requestId },
  );
}
