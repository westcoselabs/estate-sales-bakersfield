import { z } from "zod";

import { requireUser } from "@/modules/auth";
import {
  createConfiguredEventService,
  photoUploadClientPayloadSchema,
} from "@/modules/events";
import { handleVercelClientUpload, MediaStoreError } from "@/modules/media";
import { getServerEnvironment } from "@/platform/config/env";
import { requestIdFrom } from "@/platform/http/request-context";
import { logger } from "@/platform/observability/logger";

import {
  assertAuthenticationOrigin,
  authJson,
  readJson,
} from "../../../../auth/_shared";
import { eventApiError } from "../../../_shared";

interface Context {
  readonly params: Promise<{ eventId: string }>;
}

const clientTokenRequestSchema = z.object({
  type: z.literal("blob.generate-client-token"),
  payload: z.object({
    pathname: z.string().min(1).max(500),
    multipart: z.boolean(),
    clientPayload: z.string().max(2_000).nullable(),
  }),
});

export async function POST(request: Request, context: Context) {
  const requestId = requestIdFrom(request);
  try {
    assertAuthenticationOrigin(request);
    const { eventId } = await context.params;
    const principal = await requireUser();
    const body = clientTokenRequestSchema.parse(await readJson(request));
    const token = getServerEnvironment().BLOB_READ_WRITE_TOKEN;
    if (!token) {
      throw new MediaStoreError(
        "PROVIDER_UNAVAILABLE",
        "Private Blob media is not configured",
      );
    }
    const result = await handleVercelClientUpload({
      request,
      body,
      token,
      authorize: async (pathname, clientPayload, multipart) => {
        if (multipart) {
          throw new MediaStoreError(
            "INVALID_SCOPE",
            "Multipart event photo uploads are not supported",
          );
        }
        const parsedPayload = photoUploadClientPayloadSchema.parse(
          clientPayload ? JSON.parse(clientPayload) : null,
        );
        return createConfiguredEventService().authorizePhotoUpload(
          principal,
          eventId,
          { ...parsedPayload, pathname },
        );
      },
    });
    logger.info(
      { requestId, operation: "events.authorize-photo-upload" },
      "Event photo client upload authorized",
    );
    return authJson(result, { requestId });
  } catch (error) {
    return eventApiError(error, request, "events.authorize-photo-upload");
  }
}
