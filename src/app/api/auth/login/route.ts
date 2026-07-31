import {
  createConfiguredAbuseControl,
  createConfiguredAuthenticationWorkflow,
  loginSchema,
  setSessionCookie,
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
    const input = loginSchema.parse(await readJson(request));
    await createConfiguredAbuseControl().assertAllowed(
      "LOGIN",
      networkIdentifierFrom(request),
      input.email,
    );
    const result = await createConfiguredAuthenticationWorkflow().login(
      input.email,
      input.password,
      request.headers.get("user-agent")
        ? { userAgent: request.headers.get("user-agent") as string }
        : {},
      { requestId },
    );
    await setSessionCookie(result.grant);
    return authJson({ account: result.account, requestId }, { requestId });
  } catch (error) {
    return authenticationApiError(error, request, "auth.login", requestId);
  }
}
