import { z } from "zod";

import {
  createConfiguredMarketingPreferenceService,
  getCurrentUser,
} from "@/modules/auth";
import { requestIdFrom } from "@/platform/http/request-context";

import {
  assertAuthenticationOrigin,
  authenticationApiError,
  authJson,
  readJson,
} from "../../auth/_shared";

const schema = z.object({ subscribed: z.boolean() }).strict();

export async function PUT(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    assertAuthenticationOrigin(request);
    const input = schema.parse(await readJson(request));
    const preference =
      await createConfiguredMarketingPreferenceService().update(
        await getCurrentUser(),
        input.subscribed,
        { requestId },
      );
    return authJson(
      {
        subscribed: preference.eligible,
        consentAt: preference.consentAt?.toISOString() ?? null,
        unsubscribedAt: preference.unsubscribedAt?.toISOString() ?? null,
        requestId,
      },
      { requestId },
    );
  } catch (error) {
    return authenticationApiError(
      error,
      request,
      "account.marketing-preference",
      requestId,
    );
  }
}
