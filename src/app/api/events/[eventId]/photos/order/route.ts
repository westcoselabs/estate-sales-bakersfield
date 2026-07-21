import { requireUser } from "@/modules/auth";
import {
  createConfiguredEventService,
  photoOrderSchema,
} from "@/modules/events";
import { requestIdFrom } from "@/platform/http/request-context";

import {
  assertAuthenticationOrigin,
  authJson,
  readJson,
} from "../../../../auth/_shared";
import { eventApiError } from "../../../_shared";

interface Context {
  readonly params: Promise<{ eventId: string }>;
}

export async function PUT(request: Request, context: Context) {
  const requestId = requestIdFrom(request);
  try {
    assertAuthenticationOrigin(request);
    const { eventId } = await context.params;
    const input = photoOrderSchema.parse(await readJson(request));
    const event = await createConfiguredEventService().reorderPhotos(
      await requireUser(),
      eventId,
      input.photoIds,
      input.expectedVersion,
      { requestId },
    );
    return authJson({ event, requestId }, { requestId });
  } catch (error) {
    return eventApiError(error, request, "events.reorder-photos");
  }
}
