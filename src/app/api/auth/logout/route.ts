import {
  clearSessionCookie,
  createConfiguredSessionService,
  getCurrentSessionToken,
} from "@/modules/auth";
import { requestIdFrom } from "@/platform/http/request-context";

import {
  assertAuthenticationOrigin,
  authenticationApiError,
  authJson,
} from "../_shared";

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    assertAuthenticationOrigin(request);
    const token = await getCurrentSessionToken();
    await createConfiguredSessionService().logout(token, { requestId });
    await clearSessionCookie();
    return authJson({ success: true, requestId }, { requestId });
  } catch (error) {
    return authenticationApiError(error, request, "auth.logout");
  }
}
