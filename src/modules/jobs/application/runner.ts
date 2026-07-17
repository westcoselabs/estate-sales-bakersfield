import type { DurableJobRepository, JobHandlerRegistry } from "./ports";

export interface RunJobBatchOptions {
  readonly queue: string;
  readonly workerId: string;
  readonly limit?: number;
  readonly now?: () => Date;
  readonly random?: () => number;
  readonly staleLockMs?: number;
}

export interface RunJobBatchResult {
  readonly claimed: number;
  readonly succeeded: number;
  readonly retried: number;
  readonly dead: number;
  readonly lostLocks: number;
  readonly recoveredLocks: number;
}

const BASE_RETRY_MS = 5_000;
const MAX_RETRY_MS = 60 * 60 * 1000;

export function retryDelayMs(
  attempt: number,
  random: () => number = Math.random,
): number {
  const exponential = Math.min(
    BASE_RETRY_MS * 2 ** Math.max(0, attempt - 1),
    MAX_RETRY_MS,
  );
  const jitter = Math.floor(exponential * 0.2 * random());
  return exponential + jitter;
}

function describeError(error: unknown): { code: string; message: string } {
  if (error instanceof Error) {
    return {
      code: error.name.slice(0, 100) || "JOB_ERROR",
      message: error.message.slice(0, 1000),
    };
  }
  return {
    code: "JOB_ERROR",
    message: "Job handler failed with a non-Error value",
  };
}

export async function runJobBatch(
  repository: DurableJobRepository,
  handlers: JobHandlerRegistry,
  options: RunJobBatchOptions,
): Promise<RunJobBatchResult> {
  const now = options.now ?? (() => new Date());
  const random = options.random ?? Math.random;
  const startedAt = now();
  const recoveredLocks = await repository.recoverStaleLocks(
    new Date(startedAt.getTime() - (options.staleLockMs ?? 10 * 60 * 1000)),
    startedAt,
  );
  const jobs = await repository.claim({
    queue: options.queue,
    workerId: options.workerId,
    limit: Math.min(Math.max(options.limit ?? 10, 1), 50),
    now: startedAt,
  });

  let succeeded = 0;
  let retried = 0;
  let dead = 0;
  let lostLocks = 0;

  for (const job of jobs) {
    try {
      const handler = handlers[job.type];
      if (!handler) throw new Error(`No handler is registered for ${job.type}`);
      await handler(job.payload, { jobId: job.id, attempt: job.attempts });
      const completed = await repository.complete(
        job.id,
        options.workerId,
        now(),
      );
      if (completed) succeeded += 1;
      else lostLocks += 1;
    } catch (error) {
      const failure = describeError(error);
      const failedAt = now();
      const disposition = await repository.fail({
        job,
        workerId: options.workerId,
        errorCode: failure.code,
        errorMessage: failure.message,
        retryAt: new Date(
          failedAt.getTime() + retryDelayMs(job.attempts, random),
        ),
        now: failedAt,
      });
      if (disposition === "RETRY") retried += 1;
      else if (disposition === "DEAD") dead += 1;
      else lostLocks += 1;
    }
  }

  return {
    claimed: jobs.length,
    succeeded,
    retried,
    dead,
    lostLocks,
    recoveredLocks,
  };
}
