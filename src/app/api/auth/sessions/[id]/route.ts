import { createConfiguredSessionService, requireUser } from "@/modules/auth";
import { requestIdFrom } from "@/platform/http/request-context";

import {
  assertAuthenticationOrigin,
  authenticationApiError,
  authJson,
} from "../../_shared";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    assertAuthenticationOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    const revoked = await createConfiguredSessionService().revokeSession(
      user.id,
      id,
      { actorUserId: user.id, requestId },
    );
    return authJson({ revoked, requestId }, { requestId });
  } catch (error) {
    return authenticationApiError(error, request, "auth.sessions.revoke");
  }
}
