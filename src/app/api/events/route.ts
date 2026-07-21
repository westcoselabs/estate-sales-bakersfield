import { requireUser } from "@/modules/auth";
import {
  createConfiguredEventService,
  createEventSchema,
} from "@/modules/events";
import { requestIdFrom } from "@/platform/http/request-context";

import {
  assertAuthenticationOrigin,
  authJson,
  readJson,
} from "../auth/_shared";
import { eventApiError } from "./_shared";

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const events = await createConfiguredEventService().list(
      await requireUser(),
    );
    return authJson({ events, requestId }, { requestId });
  } catch (error) {
    return eventApiError(error, request, "events.list");
  }
}

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    assertAuthenticationOrigin(request);
    const input = createEventSchema.parse(await readJson(request));
    const event = await createConfiguredEventService().create(
      await requireUser(),
      input.eventType,
      { requestId },
    );
    return authJson({ event, requestId }, { status: 201, requestId });
  } catch (error) {
    return eventApiError(error, request, "events.create");
  }
}
