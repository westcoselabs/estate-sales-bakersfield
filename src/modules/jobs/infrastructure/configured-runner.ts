import "server-only";

import { randomUUID } from "node:crypto";

import { cleanupConfiguredAuthenticationRateLimits } from "@/modules/auth";
import { getPrismaClient } from "@/platform/database/client";

import { runJobBatch } from "../application/runner";
import { PrismaDurableJobRepository } from "./prisma-job-repository";

export async function runConfiguredJobBatch(limit = 10) {
  const rateLimitBucketsDeleted =
    await cleanupConfiguredAuthenticationRateLimits();
  const jobs = await runJobBatch(
    new PrismaDurableJobRepository(getPrismaClient()),
    {},
    {
      queue: "default",
      workerId: `vercel-${randomUUID()}`,
      limit,
    },
  );
  return { ...jobs, rateLimitBucketsDeleted };
}
