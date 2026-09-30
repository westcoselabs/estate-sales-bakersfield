import { requireUser, PrismaAuthenticationRateLimiter } from "@/modules/auth";
import {
  createConfiguredEventService,
  EventResourceLimitError,
  photoUploadMetricsSchema,
} from "@/modules/events";
import { getServerEnvironment } from "@/platform/config/env";
import { getPrismaClient } from "@/platform/database/client";
import {
  readBoundedText,
  BoundedBodyError,
} from "@/platform/http/bounded-body";
import { requestIdFrom } from "@/platform/http/request-context";
import { logger } from "@/platform/observability/logger";
import { assertAuthenticationOrigin, authJson } from "../../../../auth/_shared";
import { eventApiError } from "../../../_shared";

export async function POST(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    assertAuthenticationOrigin(request);
    const principal = await requireUser();
    const environment = getServerEnvironment();
    const limiter = new PrismaAuthenticationRateLimiter(getPrismaClient(), {
      environment: environment.APP_ENV,
      ...(environment.TEST_RUN_ID ? { scope: environment.TEST_RUN_ID } : {}),
    });
    const admission = await limiter.consume({
      namespace: "photo-upload-metrics",
      identifier: principal.id,
      limit: 60,
      windowSeconds: 3600,
    });
    if (!admission.allowed)
      throw new EventResourceLimitError(
        "Upload metrics rate limit reached.",
        "RATE_LIMITED",
        admission.retryAfterSeconds,
      );
    const metrics = photoUploadMetricsSchema.parse(
      JSON.parse(await readBoundedText(request, { maxBytes: 2048 })),
    );
    const { eventId } = await context.params;
    await createConfiguredEventService().get(principal, eventId);
    logger.info(
      {
        operation: "events.photo-upload-batch",
        requestId,
        pipeline: 2,
        ...metrics,
      },
      "Photo upload batch measured",
    );
    return authJson({ received: true }, { requestId });
  } catch (error) {
    if (error instanceof BoundedBodyError)
      return authJson({ error: error.message }, { requestId, status: 413 });
    return eventApiError(error, request, "events.photo-upload-metrics");
  }
}
