import {
  createConfiguredAbuseControl,
  createConfiguredAuthenticationWorkflow,
  passwordResetSchema,
} from "@/modules/auth";
import {
  networkIdentifierFrom,
  requestIdFrom,
} from "@/platform/http/request-context";

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
    const input = passwordResetSchema.parse(await readJson(request));
    await createConfiguredAbuseControl().assertAllowed(
      "RESET_PASSWORD",
      networkIdentifierFrom(request),
      input.token,
    );
    await createConfiguredAuthenticationWorkflow().resetPassword(
      input.token,
      input.password,
      { requestId },
    );
    return authJson(
      {
        message: "Your password has been reset. Please log in again.",
        requestId,
      },
      { requestId },
    );
  } catch (error) {
    return authenticationApiError(error, request, "auth.reset-password");
  }
}
