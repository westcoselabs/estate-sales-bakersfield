import { requireUser } from "@/modules/auth";
import {
  cancelPaymentRequestSchema,
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
    const input = cancelPaymentRequestSchema.parse(await readJson(request));
    await createConfiguredPaymentService().cancelReturn(
      await requireUser(),
      eventId,
      input.attemptId,
      { requestId },
    );
    return authJson({ canceled: true, requestId }, { requestId });
  } catch (error) {
    return eventApiError(error, request, "payments.cancel-return");
  }
}
