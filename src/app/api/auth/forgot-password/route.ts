import {
  createConfiguredAbuseControl,
  createConfiguredAuthenticationWorkflow,
  emailRequestSchema,
  RateLimitExceededError,
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
    const input = emailRequestSchema.parse(await readJson(request));
    await createConfiguredAbuseControl().assertAllowed(
      "FORGOT_PASSWORD",
      networkIdentifierFrom(request),
      input.email,
    );
    await createConfiguredAuthenticationWorkflow().requestPasswordReset(
      input.email,
      { requestId },
    );
    await waitForMinimumDuration(startedAt, 750);
    return authJson(
      {
        message:
          "If the account can be recovered, reset instructions have been sent.",
        requestId,
      },
      { status: 202, requestId },
    );
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      await waitForMinimumDuration(startedAt, 750);
      return authJson(
        {
          message:
            "If the account can be recovered, reset instructions have been sent.",
          requestId,
        },
        { status: 202, requestId },
      );
    }
    return authenticationApiError(error, request, "auth.forgot-password");
  }
}
