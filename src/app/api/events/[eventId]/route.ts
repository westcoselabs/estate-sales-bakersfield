import { requireUser } from "@/modules/auth";
import {
  createConfiguredEventService,
  eventDetailsSchema,
} from "@/modules/events";
import { requestIdFrom } from "@/platform/http/request-context";

import {
  assertAuthenticationOrigin,
  authJson,
  readJson,
} from "../../auth/_shared";
import { eventApiError } from "../_shared";

interface Context {
  readonly params: Promise<{ eventId: string }>;
}

export async function GET(request: Request, context: Context) {
  const requestId = requestIdFrom(request);
  try {
    const { eventId } = await context.params;
    const event = await createConfiguredEventService().get(
      await requireUser(),
      eventId,
    );
    return authJson({ event, requestId }, { requestId });
  } catch (error) {
    return eventApiError(error, request, "events.read");
  }
}

export async function PATCH(request: Request, context: Context) {
  const requestId = requestIdFrom(request);
  try {
    assertAuthenticationOrigin(request);
    const { eventId } = await context.params;
    const input = eventDetailsSchema.parse(await readJson(request));
    const event = await createConfiguredEventService().updateDetails(
      await requireUser(),
      eventId,
      input,
      { requestId },
    );
    return authJson({ event, requestId }, { requestId });
  } catch (error) {
    return eventApiError(error, request, "events.update-details");
  }
}
