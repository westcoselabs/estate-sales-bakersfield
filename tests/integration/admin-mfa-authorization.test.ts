import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaAdminUserRepository } from "@/modules/admin/infrastructure/prisma-admin-user-repository";
import { PrismaEmailCenterRepository } from "@/modules/email/infrastructure/prisma-email-center-repository";
import { ListingImportService } from "@/modules/listing-imports/application/listing-import-service";
import { listingContentHash } from "@/modules/listing-imports/application/content-hash";
import { PrismaListingImportRepository } from "@/modules/listing-imports/infrastructure/prisma-listing-import-repository";
import { authorizedAdministratorSession } from "@/platform/database/admin-session-authorization";

import { createIntegrationClient } from "./support/database";
import {
  createListingImportReviewHarness,
  type ListingImportReviewHarness,
} from "./support/listing-import-review-fixtures";

const prisma = createIntegrationClient();
let harness: ListingImportReviewHarness;

beforeAll(async () => {
  harness = await createListingImportReviewHarness(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("transactional administrator MFA authorization", () => {
  it("allows unenrolled administrators while preserving password recency and role checks", async () => {
    const rollback = new Error("rollback optional MFA fixture");
    await expect(
      prisma.$transaction(async (transaction) => {
        await transaction.adminMfaCredential.delete({
          where: { userId: harness.administratorId },
        });
        await transaction.session.update({
          where: { id: harness.administratorSessionId },
          data: { mfaAuthenticatedAt: null, mfaCredentialVersion: null },
        });
        const input = {
          userId: harness.administratorId,
          sessionId: harness.administratorSessionId,
          requireRecent: true,
        };
        expect(
          await authorizedAdministratorSession(transaction, input),
        ).toBeInstanceOf(Date);
        await transaction.session.update({
          where: { id: input.sessionId },
          data: { passwordAuthenticatedAt: new Date(Date.now() - 16 * 60_000) },
        });
        expect(
          await authorizedAdministratorSession(transaction, input),
        ).toBeNull();
        expect(
          await authorizedAdministratorSession(transaction, {
            ...input,
            requireRecent: false,
          }),
        ).toBeInstanceOf(Date);
        await transaction.user.update({
          where: { id: input.userId },
          data: { role: "USER" },
        });
        expect(
          await authorizedAdministratorSession(transaction, {
            ...input,
            requireRecent: false,
          }),
        ).toBeNull();
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it("accepts a live session bound to the enabled credential generation", async () => {
    const authorizedAt = await prisma.$transaction((transaction) =>
      authorizedAdministratorSession(transaction, {
        userId: harness.administratorId,
        sessionId: harness.administratorSessionId,
        requireRecent: true,
      }),
    );
    expect(authorizedAt).toBeInstanceOf(Date);
  });

  it.each(["missing", "stale-generation", "stale-proof"] as const)(
    "rejects %s MFA before manual import, approval, account mutation, or campaign dispatch",
    async (invalidProof) => {
      const fixture = harness.nextFixture(`mfa-${invalidProof}`);
      const candidate = await harness.createCandidate(fixture);
      const confirmed = await harness.confirmCandidate(candidate.candidateId);
      const sessionId = await harness.createSession();
      const session = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
      });
      await prisma.session.update({
        where: { id: sessionId },
        data:
          invalidProof === "missing"
            ? { mfaAuthenticatedAt: null, mfaCredentialVersion: null }
            : invalidProof === "stale-generation"
              ? { mfaCredentialVersion: session.mfaCredentialVersion! + 1 }
              : { mfaAuthenticatedAt: new Date(Date.now() - 16 * 60 * 1_000) },
      });

      const runId = randomUUID();
      const imports = new ListingImportService(
        new PrismaListingImportRepository(prisma),
        "test",
      );
      await expect(
        imports.importBatch(
          {
            contractVersion: "listing-import.v1",
            sourceKey: "fixture",
            ingestorRunId: runId,
            ingestorInstanceId: "mfa-authorization-test",
            parserVersion: "fixture@1",
            items: [
              {
                ...fixture.content,
                sourceListingId: fixture.sourceListingId,
                sourceUrl: fixture.sourceUrl,
                retrievedAt: new Date().toISOString(),
                contentHash: listingContentHash(fixture.normalized),
              },
            ],
          },
          {
            transport: "MANUAL_JSON",
            actor: {
              kind: "ADMIN_USER",
              adminUserId: harness.administratorId,
              adminSessionId: sessionId,
            },
          },
        ),
      ).rejects.toMatchObject({ code: "ACTOR_TRANSPORT_MISMATCH" });
      expect(
        await prisma.listingImportBatch.count({
          where: { ingestorRunId: runId },
        }),
      ).toBe(0);

      await expect(
        harness.reviews.approveCandidate(
          harness.actor(sessionId),
          candidate.candidateId,
          { expectedVersion: confirmed.version },
        ),
      ).rejects.toMatchObject({ code: "ACTOR_NOT_AUTHORIZED" });
      expect(
        await prisma.externalListing.count({
          where: { candidateId: candidate.candidateId },
        }),
      ).toBe(0);

      await expect(
        new PrismaAdminUserRepository(prisma).revokeSessions({
          targetId: randomUUID(),
          actorId: harness.administratorId,
          actorSessionId: sessionId,
        }),
      ).rejects.toMatchObject({ name: "AuthorizationError" });
      await expect(
        new PrismaEmailCenterRepository(prisma).prepareCampaign({
          id: randomUUID(),
          expectedVersion: 1,
          actorId: harness.administratorId,
          actorSessionId: sessionId,
        }),
      ).rejects.toMatchObject({ name: "AuthorizationError" });
    },
  );
});
