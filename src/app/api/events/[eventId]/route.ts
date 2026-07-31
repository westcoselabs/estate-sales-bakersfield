import { requireUser } from "@/modules/auth";
import {
  createConfiguredEventService,
  eventDetailsSchema,
  eventLifecycleMutationSchema,
} from "@/modules/events";
import { createConfiguredPaymentService } from "@/modules/payments";
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

export async function DELETE(request: Request, context: Context) {
  const requestId = requestIdFrom(request);
  try {
    assertAuthenticationOrigin(request);
    const { eventId } = await context.params;
    const input = eventLifecycleMutationSchema.parse(await readJson(request));
    const user = await requireUser();
    await createConfiguredPaymentService().prepareDraftDeletion(user, eventId, {
      requestId,
    });
    const result = await createConfiguredEventService().deleteDraft(
      user,
      eventId,
      input,
      { requestId },
    );
    return authJson({ ...result, requestId }, { requestId });
  } catch (error) {
    return eventApiError(error, request, "events.delete-draft");
  }
}
