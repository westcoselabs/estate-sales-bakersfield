import { requireUser } from "@/modules/auth";
import { createConfiguredPaymentService } from "@/modules/payments";
import { requestIdFrom } from "@/platform/http/request-context";

import { authJson } from "../../../auth/_shared";
import { eventApiError } from "../../_shared";

interface Context {
  readonly params: Promise<{ eventId: string }>;
}

export async function GET(request: Request, context: Context) {
  const requestId = requestIdFrom(request);
  try {
    const { eventId } = await context.params;
    const payment = await createConfiguredPaymentService().status(
      await requireUser(),
      eventId,
    );
    return authJson({ payment, requestId }, { requestId });
  } catch (error) {
    return eventApiError(error, request, "payments.status");
  }
}
