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
} from "../../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createCredentialSchema = z
  .object({
    sourceKey: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u),
    name: z.string().trim().min(1).max(100),
  })
  .strict();

export async function POST(request: Request) {
  const startedAt = performance.now();
  const requestId = requestIdFrom(request);

  try {
    assertAdminOrigin(request);
    const session = authorizeRecentAdminService(await getCurrentSession());
    await enforceAdminRateLimit(
      createConfiguredAdminRateLimiter(),
      "LISTING_IMPORT",
      session.principal.id,
    );
    const input = createCredentialSchema.parse(
      await readAdminBoundedJson(request),
    );
    const credential =
      await createConfiguredListingIngestionCredentialService().create({
        ...input,
        actorUserId: session.principal.id,
        requestId,
      });

    return adminJson(
      {
        schema: "listing-ingestion-credential.v1",
        credential: {
          id: credential.credentialId,
          sourceId: credential.sourceId,
          sourceKey: credential.sourceKey,
          name: credential.name,
          displayPrefix: credential.displayPrefix,
          token: credential.rawToken,
          createdAt: credential.createdAt.toISOString(),
        },
        warning: "Copy this token now. It will not be shown again.",
        requestId,
      },
      { requestId, status: 201 },
    );
  } catch (error) {
    return adminApiError(
      error,
      requestId,
      "admin.imports.credentials.create",
      startedAt,
    );
  }
}
