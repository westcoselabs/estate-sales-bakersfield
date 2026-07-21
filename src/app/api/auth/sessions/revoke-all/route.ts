import {
  clearSessionCookie,
  createConfiguredSessionService,
  requireUser,
} from "@/modules/auth";
import { requestIdFrom } from "@/platform/http/request-context";

import {
  assertAuthenticationOrigin,
  authenticationApiError,
  authJson,
} from "../../_shared";

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    assertAuthenticationOrigin(request);
    const user = await requireUser();
    const revokedCount = await createConfiguredSessionService().revokeAll(
      user.id,
      {
        actorUserId: user.id,
        requestId,
      },
    );
    await clearSessionCookie();
    return authJson({ revokedCount, requestId }, { requestId });
  } catch (error) {
    return authenticationApiError(error, request, "auth.sessions.revoke-all");
  }
}
