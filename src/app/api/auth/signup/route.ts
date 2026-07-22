import {
  AccountConflictError,
  createConfiguredAbuseControl,
  createConfiguredAuthenticationWorkflow,
  registrationSchema,
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
  waitForMinimumDuration,
} from "../_shared";

export async function POST(request: Request) {
  const startedAt = performance.now();
  const requestId = requestIdFrom(request);
  try {
    assertAuthenticationOrigin(request);
    const input = registrationSchema.parse(await readJson(request));
    await createConfiguredAbuseControl().assertAllowed(
      "REGISTER",
      networkIdentifierFrom(request),
      input.email,
    );
    try {
      await createConfiguredAuthenticationWorkflow().register(
        {
          displayName: input.displayName,
          email: input.email,
          password: input.password,
        },
        { requestId },
      );
    } catch (error) {
      if (!(error instanceof AccountConflictError)) throw error;
    }
    await waitForMinimumDuration(startedAt, 750);
    return authJson(
      {
        message:
          "Check your email for verification instructions. You can sign in now.",
        requestId,
      },
      { status: 202, requestId },
    );
  } catch (error) {
    return authenticationApiError(error, request, "auth.signup");
  }
}
