import { createConfiguredSessionService, requireUser } from "@/modules/auth";
import { requestIdFrom } from "@/platform/http/request-context";

import { authenticationApiError, authJson } from "../_shared";

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const user = await requireUser();
    const sessions = await createConfiguredSessionService().list(user.id);
    return authJson({ sessions, requestId }, { requestId });
  } catch (error) {
    return authenticationApiError(error, request, "auth.sessions.list");
  }
}
