import { requireUser } from "@/modules/auth";
import {
  checkoutRequestSchema,
  createConfiguredPaymentService,
} from "@/modules/payments";
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

export async function POST(request: Request, context: Context) {
  const requestId = requestIdFrom(request);
  try {
    assertAuthenticationOrigin(request);
    const { eventId } = await context.params;
    const input = checkoutRequestSchema.parse(await readJson(request));
    const checkout = await createConfiguredPaymentService().createCheckout(
      await requireUser(),
      eventId,
      input.expectedVersion,
      { requestId },
    );
    return authJson({ checkout, requestId }, { status: 201, requestId });
  } catch (error) {
    return eventApiError(error, request, "payments.create-checkout");
  }
}
