import "server-only";

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/platform/database/client";

import { runJobBatch } from "../application/runner";
import { PrismaDurableJobRepository } from "./prisma-job-repository";

export function runConfiguredJobBatch(limit = 10) {
  return runJobBatch(
    new PrismaDurableJobRepository(getPrismaClient()),
    {},
    {
      queue: "default",
      workerId: `vercel-${randomUUID()}`,
      limit,
    },
  );
}
