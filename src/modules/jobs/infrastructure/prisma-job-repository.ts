import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";

import type { DurableJobRepository } from "../application/ports";
import type {
  DurableJob,
  DurableJobStatus,
  EnqueueJobInput,
} from "../domain/types";

interface JobRow {
  id: string;
  queue: string;
  type: string;
  payload: unknown;
  status: DurableJobStatus;
  run_at: Date;
  attempts: number;
  max_attempts: number;
  locked_by: string | null;
}

function mapRow(row: JobRow): DurableJob {
  return {
    id: row.id,
    queue: row.queue,
    type: row.type,
    payload: row.payload,
    status: row.status,
    runAt: row.run_at,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    lockedBy: row.locked_by,
  };
}

export class PrismaDurableJobRepository implements DurableJobRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async enqueue(input: EnqueueJobInput): Promise<DurableJob> {
    const payload = JSON.stringify(input.payload ?? null);
    const rows = await this.prisma.$queryRaw<JobRow[]>(Prisma.sql`
      INSERT INTO "durable_jobs" (
        "queue", "type", "payload", "deduplication_key", "run_at", "max_attempts"
      ) VALUES (
        ${input.queue}, ${input.type}, ${payload}::jsonb,
        ${input.deduplicationKey ?? null}, ${input.runAt ?? new Date()}, ${input.maxAttempts ?? 10}
      )
      ON CONFLICT ("queue", "type", "deduplication_key")
      DO UPDATE SET "id" = "durable_jobs"."id"
      RETURNING "id", "queue", "type", "payload", "status", "run_at", "attempts",
        "max_attempts", "locked_by"
    `);
    const row = rows[0];
    if (!row) throw new Error("The durable job insert returned no row");
    return mapRow(row);
  }

  async claim(input: Parameters<DurableJobRepository["claim"]>[0]) {
    return this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<JobRow[]>(Prisma.sql`
        WITH candidates AS (
          SELECT "id"
          FROM "durable_jobs"
          WHERE "queue" = ${input.queue}
            AND "status" IN ('PENDING', 'FAILED')
            AND "run_at" <= ${input.now}
            AND "attempts" < "max_attempts"
          ORDER BY "run_at" ASC, "created_at" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${input.limit}
        )
        UPDATE "durable_jobs" AS job
        SET "status" = 'RUNNING',
            "locked_at" = ${input.now},
            "locked_by" = ${input.workerId},
            "attempts" = job."attempts" + 1,
            "updated_at" = ${input.now}
        FROM candidates
        WHERE job."id" = candidates."id"
        RETURNING job."id", job."queue", job."type", job."payload", job."status",
          job."run_at", job."attempts", job."max_attempts", job."locked_by"
      `);
      return rows.map(mapRow);
    });
  }

  async complete(
    jobId: string,
    workerId: string,
    completedAt: Date,
  ): Promise<boolean> {
    const update = await this.prisma.durableJob.updateMany({
      where: { id: jobId, lockedBy: workerId, status: "RUNNING" },
      data: {
        status: "SUCCEEDED",
        completedAt,
        lockedAt: null,
        lockedBy: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    return update.count === 1;
  }

  async fail(input: Parameters<DurableJobRepository["fail"]>[0]) {
    const terminal = input.job.attempts >= input.job.maxAttempts;
    const update = await this.prisma.durableJob.updateMany({
      where: { id: input.job.id, lockedBy: input.workerId, status: "RUNNING" },
      data: {
        status: terminal ? "DEAD" : "FAILED",
        runAt: input.retryAt,
        lockedAt: null,
        lockedBy: null,
        lastErrorCode: input.errorCode.slice(0, 100),
        lastErrorMessage: input.errorMessage.slice(0, 1000),
      },
    });
    if (update.count !== 1) return "LOST_LOCK" as const;
    return terminal ? ("DEAD" as const) : ("RETRY" as const);
  }

  async recoverStaleLocks(staleBefore: Date, retryAt: Date): Promise<number> {
    return this.prisma.$executeRaw(Prisma.sql`
      UPDATE "durable_jobs"
      SET "status" = CASE
            WHEN "attempts" >= "max_attempts" THEN 'DEAD'::"job_status"
            ELSE 'FAILED'::"job_status"
          END,
          "run_at" = ${retryAt},
          "locked_at" = NULL,
          "locked_by" = NULL,
          "last_error_code" = 'STALE_LOCK',
          "last_error_message" = 'Worker lock expired before completion',
          "updated_at" = ${retryAt}
      WHERE "status" = 'RUNNING'
        AND "locked_at" < ${staleBefore}
    `);
  }
}
