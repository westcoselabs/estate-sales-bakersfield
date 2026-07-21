import { requireUser } from "@/modules/auth";
import {
  createConfiguredEventService,
  eventScheduleSchema,
} from "@/modules/events";
import { requestIdFrom } from "@/platform/http/request-context";

import {
  assertAuthenticationOrigin,
  authJson,
  readJson,
} from "../../../auth/_shared";
import { eventApiError } from "../../_shared";

interface Context {
  readonly params: Promise<{ eventId: string }>;
}

export async function PUT(request: Request, context: Context) {
  const requestId = requestIdFrom(request);
  try {
    assertAuthenticationOrigin(request);
    const { eventId } = await context.params;
    const input = eventScheduleSchema.parse(await readJson(request));
    const event = await createConfiguredEventService().updateSchedule(
      await requireUser(),
      eventId,
      input,
      { requestId },
    );
    return authJson({ event, requestId }, { requestId });
  } catch (error) {
    return eventApiError(error, request, "events.update-schedule");
  }
}
