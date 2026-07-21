import { requireUser } from "@/modules/auth";
import {
  createConfiguredEventService,
  photoMutationSchema,
} from "@/modules/events";
import { requestIdFrom } from "@/platform/http/request-context";

import {
  assertAuthenticationOrigin,
  authJson,
  readJson,
} from "../../../../auth/_shared";
import { eventApiError } from "../../../_shared";

interface Context {
  readonly params: Promise<{ eventId: string; photoId: string }>;
}

export async function DELETE(request: Request, context: Context) {
  const requestId = requestIdFrom(request);
  try {
    assertAuthenticationOrigin(request);
    const { eventId, photoId } = await context.params;
    const input = photoMutationSchema.parse(await readJson(request));
    const event = await createConfiguredEventService().deletePhoto(
      await requireUser(),
      eventId,
      photoId,
      input.expectedVersion,
      { requestId },
    );
    return authJson({ event, requestId }, { requestId });
  } catch (error) {
    return eventApiError(error, request, "events.delete-photo");
  }
}
