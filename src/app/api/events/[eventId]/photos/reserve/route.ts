import { requireUser } from "@/modules/auth";
import {
  createConfiguredEventService,
  photoReservationSchema,
} from "@/modules/events";
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

export async function POST(request: Request, context: Context) {
  const requestId = requestIdFrom(request);
  try {
    assertAuthenticationOrigin(request);
    const { eventId } = await context.params;
    const input = photoReservationSchema.parse(await readJson(request));
    const reservation = await createConfiguredEventService().reservePhoto(
      await requireUser(),
      eventId,
      input,
      { requestId },
    );
    logger.info(
      {
        requestId,
        operation: "events.reserve-photo",
        transport: reservation.transport,
      },
      "Event photo reservation created",
    );
    return authJson({ reservation, requestId }, { status: 201, requestId });
  } catch (error) {
    return eventApiError(error, request, "events.reserve-photo");
  }
}
