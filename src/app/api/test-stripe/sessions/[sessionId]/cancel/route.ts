import { cancelConfiguredFakeCheckout } from "@/modules/payments";
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
    return Response.redirect(cancelConfiguredFakeCheckout(sessionId), 303);
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
