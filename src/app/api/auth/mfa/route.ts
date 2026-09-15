import { z, ZodError } from "zod";
import {
  createConfiguredAbuseControl,
  createConfiguredAdminMfaService,
  createConfiguredAuthenticationWorkflow,
  getCurrentSession,
  getCurrentSessionToken,
  requireSuperAdminIdentity,
  setSessionCookie,
} from "@/modules/auth";
import {
  readBoundedText,
  BoundedBodyError,
} from "@/platform/http/bounded-body";
import {
  networkIdentifierFrom,
  requestIdFrom,
} from "@/platform/http/request-context";
import {
  assertAuthenticationOrigin,
  authenticationApiError,
  authJson,
} from "../_shared";

const inputSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("enroll"),
      password: z.string().min(1).max(128),
    })
    .strict(),
  z
    .object({ action: z.literal("confirm"), code: z.string().regex(/^\d{6}$/) })
    .strict(),
  z
    .object({
      action: z.literal("challenge"),
      code: z.string().min(6).max(50),
      recovery: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("recovery-codes"),
      password: z.string().min(1).max(128),
    })
    .strict(),
  z
    .object({
      action: z.literal("password"),
      password: z.string().min(1).max(128),
    })
    .strict(),
]);

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    assertAuthenticationOrigin(request);
    const session = await getCurrentSession();
    const administrator = requireSuperAdminIdentity(session?.principal ?? null);
    await createConfiguredAbuseControl().assertAllowed(
      "ADMIN_MFA",
      networkIdentifierFrom(request),
      administrator.id,
    );
    if (
      !(request.headers.get("content-type") ?? "").includes("application/json")
    )
      throw new ZodError([]);
    const input = inputSchema.parse(
      JSON.parse(await readBoundedText(request, { maxBytes: 2048 })),
    );
    if (input.action === "password") {
      const grant =
        await createConfiguredAuthenticationWorkflow().reauthenticateSuperAdmin(
          administrator,
          await getCurrentSessionToken(),
          input.password,
          {},
          { requestId },
        );
      await setSessionCookie(grant);
      return authJson({ confirmed: true, requestId }, { requestId });
    }
    const service = createConfiguredAdminMfaService();
    if (input.action === "enroll")
      return authJson(
        await service.enroll(session, input.password, requestId),
        { requestId },
      );
    if (input.action === "challenge") {
      const grant = await service.challenge(
        session,
        input.code,
        input.recovery,
        requestId,
      );
      await setSessionCookie(grant);
      return authJson({ verified: true, requestId }, { requestId });
    }
    const result =
      input.action === "confirm"
        ? await service.confirmEnrollment(session, input.code, requestId)
        : await service.regenerateRecoveryCodes(
            session,
            input.password,
            requestId,
          );
    await setSessionCookie(result.grant);
    return authJson(
      { verified: true, recoveryCodes: result.recoveryCodes, requestId },
      { requestId },
    );
  } catch (error) {
    if (error instanceof BoundedBodyError)
      return authJson(
        { error: "Please check the submitted information.", requestId },
        { status: error.code === "PAYLOAD_TOO_LARGE" ? 413 : 400, requestId },
      );
    return authenticationApiError(error, request, "auth.admin-mfa", requestId);
  }
}
