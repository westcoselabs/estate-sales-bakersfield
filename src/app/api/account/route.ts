import { getCurrentUser, requireUser } from "@/modules/auth";
import { requestIdFrom } from "@/platform/http/request-context";

import { authenticationApiError, authJson } from "../auth/_shared";

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    await requireUser();
    const principal = await getCurrentUser();
    return authJson(
      {
        account: principal
          ? {
              id: principal.id,
              displayName: principal.displayName,
              email: principal.email,
              emailVerified: principal.emailVerifiedAt !== null,
              role: principal.role,
              status: principal.status,
            }
          : null,
        requestId,
      },
      { requestId },
    );
  } catch (error) {
    return authenticationApiError(error, request, "account.read");
  }
}
