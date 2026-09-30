import { requireUser } from "@/modules/auth";
import { createConfiguredEventService } from "@/modules/events";
import { requestIdFrom } from "@/platform/http/request-context";
import { authJson } from "../../../../../auth/_shared";
import { eventApiError } from "../../../../_shared";

export async function GET(
  request: Request,
  context: { params: Promise<{ eventId: string; photoId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const { eventId, photoId } = await context.params;
    const result = await createConfiguredEventService().inspectPhotoTransfer(
      await requireUser(),
      eventId,
      photoId,
      new URL(request.url).searchParams.get("reservationId") ?? "",
    );
    return authJson(result, { requestId });
  } catch (error) {
    return eventApiError(error, request, "events.inspect-photo-transfer");
  }
}
