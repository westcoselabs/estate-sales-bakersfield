import { requireUser } from "@/modules/auth";
import {
  createConfiguredEventService,
  eventLocationSchema,
} from "@/modules/events";
import { verifyLocationSelectionToken } from "@/modules/locations";
import { getServerEnvironment } from "@/platform/config/env";
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
    const parsed = eventLocationSchema.parse(await readJson(request));
    const secret = getServerEnvironment().AUTH_FINGERPRINT_SECRET;
    const selectedLocation =
      parsed.confirmed && parsed.selectionToken && secret
        ? verifyLocationSelectionToken(parsed.selectionToken, secret)
        : undefined;
    const event = await createConfiguredEventService().updateLocation(
      await requireUser(),
      eventId,
      {
        ...parsed,
        ...(selectedLocation ? { selectedLocation } : {}),
      },
      { requestId },
    );
    return authJson({ event, requestId }, { requestId });
  } catch (error) {
    return eventApiError(error, request, "events.update-location");
  }
}
