import {
  completeConfiguredFakeCheckout,
  createConfiguredPaymentService,
} from "@/modules/payments";
import { getServerEnvironment } from "@/platform/config/env";

interface Context {
  readonly params: Promise<{ sessionId: string }>;
}

export async function POST(_request: Request, context: Context) {
  if (!["local", "test"].includes(getServerEnvironment().APP_ENV)) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const { sessionId } = await context.params;
    const completed = completeConfiguredFakeCheckout(sessionId);
    await createConfiguredPaymentService().handleWebhook(
      completed.body,
      completed.signature,
    );
    return Response.redirect(completed.redirectUrl, 303);
  } catch {
    return new Response("Test payment could not be completed", {
      status: 422,
      headers: { "cache-control": "no-store" },
    });
  }
}
