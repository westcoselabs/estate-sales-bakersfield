import {
  createConfiguredAuthenticationWorkflow,
  getCurrentSessionToken,
  setSessionCookie,
  tokenSchema,
} from "@/modules/auth";
import { requestIdFrom } from "@/platform/http/request-context";

import {
  assertAuthenticationOrigin,
  authenticationApiError,
  authJson,
  readJson,
} from "../_shared";

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    assertAuthenticationOrigin(request);
    const input = tokenSchema.parse(await readJson(request));
    const result = await createConfiguredAuthenticationWorkflow().verifyEmail(
      input.token,
      await getCurrentSessionToken(),
      request.headers.get("user-agent")
        ? { userAgent: request.headers.get("user-agent") as string }
        : {},
      { requestId },
    );
    if (result.rotatedSession) {
      await setSessionCookie(result.rotatedSession);
    }
    return authJson(
      {
        account: result.account,
        authenticated: result.authenticated,
        verified: true,
        alreadyVerified: result.alreadyVerified,
        message: result.alreadyVerified
          ? "This email is already verified. Continue to login."
          : "Email verified.",
        requestId,
      },
      { requestId },
    );
  } catch (error) {
    return authenticationApiError(error, request, "auth.verify-email");
  }
}
