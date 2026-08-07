import { z } from "zod";

import {
  authorizeRecentAdminService,
  createConfiguredAdminRateLimiter,
  enforceAdminRateLimit,
} from "@/modules/admin";
import { getCurrentSession } from "@/modules/auth";
import { createConfiguredListingIngestionCredentialService } from "@/modules/listing-imports";
import { requestIdFrom } from "@/platform/http/request-context";

import {
  adminApiError,
  adminJson,
  assertAdminOrigin,
  readAdminBoundedJson,
} from "../../../../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z.object({}).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ credentialId: string }> },
) {
  const startedAt = performance.now();
  const requestId = requestIdFrom(request);

  try {
    assertAdminOrigin(request);
    const session = authorizeRecentAdminService(await getCurrentSession());
    const credentialId = z
      .string()
      .uuid()
      .parse((await params).credentialId);
    await enforceAdminRateLimit(
      createConfiguredAdminRateLimiter(),
      "LISTING_IMPORT",
      session.principal.id,
      credentialId,
    );
    requestSchema.parse(await readAdminBoundedJson(request));
    const result =
      await createConfiguredListingIngestionCredentialService().revoke({
        credentialId,
        actorUserId: session.principal.id,
        actorSessionId: session.id,
        requestId,
      });

    if (!result) {
      return adminJson(
        {
          schema: "admin-error/v1",
          error: "The ingestion credential was not found.",
          code: "CREDENTIAL_NOT_FOUND",
          requestId,
        },
        { requestId, status: 404 },
      );
    }

    return adminJson(
      {
        schema: "listing-ingestion-credential-revocation.v1",
        credentialId: result.credentialId,
        revokedAt: result.revokedAt.toISOString(),
        alreadyRevoked: result.alreadyRevoked,
        requestId,
      },
      { requestId },
    );
  } catch (error) {
    return adminApiError(
      error,
      requestId,
      "admin.imports.credentials.revoke",
      startedAt,
    );
  }
}
