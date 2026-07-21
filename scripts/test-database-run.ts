import { spawnSync } from "node:child_process";

import { PrismaNeon } from "@prisma/adapter-neon";

import { PrismaClient } from "@/generated/prisma/client";

import type { SafeTestDatabaseConfiguration } from "./test-database-safety";
import { redactTestDatabaseText } from "./test-database-safety";

export function testDatabaseEnvironment(
  database: SafeTestDatabaseConfiguration,
  runId: string,
  parentEnvironment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    ...parentEnvironment,
    NODE_ENV: "test",
    APP_ENV: "test",
    DATABASE_URL: database.pooledUrl,
    DIRECT_URL: database.directUrl,
    DATABASE_RESOURCE_ENV: undefined,
    TEST_RUN_ID: runId,
    CRON_SECRET: undefined,
    AUTH_FINGERPRINT_SECRET: undefined,
    AUTH_EMAIL_CAPTURE_PATH: undefined,
    BLOB_READ_WRITE_TOKEN: undefined,
    BLOB_RESOURCE_ENV: undefined,
    RESEND_API_KEY: undefined,
    RESEND_FROM: undefined,
    RESEND_RESOURCE_ENV: undefined,
    UPSTASH_REDIS_REST_URL: undefined,
    UPSTASH_REDIS_REST_TOKEN: undefined,
    UPSTASH_RESOURCE_ENV: undefined,
    MAPBOX_ACCESS_TOKEN: undefined,
    MAPBOX_RESOURCE_ENV: undefined,
    VERCEL_OIDC_TOKEN: undefined,
    VERCEL_ENV: undefined,
    SENTRY_DSN: undefined,
    NEXT_PUBLIC_SENTRY_DSN: undefined,
  };
  for (const name of Object.keys(environment)) {
    if (
      name.startsWith("VERCEL_") ||
      name.startsWith("PREVIEW_") ||
      name.startsWith("PRODUCTION_") ||
      name.startsWith("NEXT_PUBLIC_")
    ) {
      delete environment[name];
    }
  }
  environment.NEXT_PUBLIC_APP_ENV = "test";
  return environment;
}

export function deployTestMigrations(
  database: SafeTestDatabaseConfiguration,
  runId: string,
): void {
  const isWindows = process.platform === "win32";
  const result = spawnSync(
    isWindows ? (process.env.ComSpec ?? "cmd.exe") : "pnpm",
    isWindows
      ? ["/d", "/s", "/c", "pnpm exec prisma migrate deploy"]
      : ["exec", "prisma", "migrate", "deploy"],
    {
      cwd: process.cwd(),
      env: testDatabaseEnvironment(database, runId),
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    const evidence = redactTestDatabaseText(
      `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim(),
      database,
    );
    throw new Error(
      `Test Neon migration failed with exit code ${String(result.status)}${evidence ? `\n${evidence}` : ""}`,
    );
  }
}

export async function cleanupTestRun(
  database: SafeTestDatabaseConfiguration,
  runId: string,
): Promise<void> {
  if (!/^testrun-[a-z0-9-]+$/.test(runId)) {
    throw new Error("Refusing cleanup for an invalid test-run identifier");
  }
  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: database.pooledUrl }),
  });
  try {
    await prisma.durableJob.deleteMany({
      where: { queue: { startsWith: `${runId}-` } },
    });
    await prisma.$transaction(async (transaction) => {
      const users = await transaction.user.findMany({
        where: { normalizedEmail: { startsWith: `${runId}-` } },
        select: {
          id: true,
          sessions: { select: { id: true } },
          organizerProfile: {
            select: {
              id: true,
              events: { select: { id: true } },
            },
          },
        },
      });
      if (users.length === 0) return;
      const userIds = users.map((user) => user.id);
      const targetIds = users.flatMap((user) => [
        user.id,
        ...user.sessions.map((session) => session.id),
        ...(user.organizerProfile
          ? [
              user.organizerProfile.id,
              ...user.organizerProfile.events.map((event) => event.id),
            ]
          : []),
      ]);
      const eventIds = users.flatMap(
        (user) => user.organizerProfile?.events.map((event) => event.id) ?? [],
      );
      if (eventIds.length > 0) {
        await transaction.event.updateMany({
          where: { id: { in: eventIds } },
          data: { coverPhotoId: null },
        });
        await transaction.event.updateMany({
          where: {
            id: { in: eventIds },
            approvalStatus: "APPROVED",
          },
          data: {
            workflowState: "PREVIEW_READY",
            approvalStatus: "NOT_APPROVED",
            approvedRevision: null,
            approvalDigest: null,
            approvedAt: null,
            termsVersion: null,
            termsAcceptedAt: null,
            termsAcceptedByUserId: null,
            currentApprovalId: null,
          },
        });
      }
      await transaction.$executeRaw`
        ALTER TABLE "audit_entries"
        DISABLE TRIGGER "audit_entries_append_only"
      `;
      await transaction.auditEntry.deleteMany({
        where: {
          OR: [
            { actorUserId: { in: userIds } },
            { targetId: { in: targetIds } },
          ],
        },
      });
      await transaction.user.deleteMany({
        where: {
          id: { in: userIds },
          normalizedEmail: { startsWith: `${runId}-` },
        },
      });
      await transaction.$executeRaw`
        ALTER TABLE "audit_entries"
        ENABLE TRIGGER "audit_entries_append_only"
      `;
    });
  } finally {
    await prisma.$disconnect();
  }
}
