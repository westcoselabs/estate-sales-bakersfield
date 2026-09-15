import type { DurableJobRepository, JobHandlerRegistry } from "./ports";

export interface RunJobBatchOptions {
  readonly queue: string;
  readonly workerId: string;
  readonly limit?: number;
  readonly now?: () => Date;
  readonly random?: () => number;
  readonly staleLockMs?: number;
  readonly concurrency?: number;
  readonly drain?: boolean;
  readonly deadlineAt?: Date;
  readonly minimumRemainingMs?: number;
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
  const limit = Math.min(Math.max(Math.floor(options.limit ?? 10), 1), 50);
  const concurrency = Math.min(
    Math.max(Math.floor(options.concurrency ?? 1), 1),
    4,
  );
  let claimed = 0;
  let succeeded = 0;
  let retried = 0;
  let dead = 0;
  let lostLocks = 0;

  async function processJob(
    job: Awaited<ReturnType<DurableJobRepository["claim"]>>[number],
  ) {
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

  do {
    // Claim only work that can start now. A deadline never strands a large
    // preclaimed batch while previous handlers wait on external providers.
    if (
      options.deadlineAt &&
      options.deadlineAt.getTime() - now().getTime() <=
        (options.minimumRemainingMs ?? 5_000)
    )
      break;
    const jobs = await repository.claim({
      queue: options.queue,
      workerId: options.workerId,
      limit: options.drain ? Math.min(concurrency, limit - claimed) : limit,
      now: now(),
    });
    if (jobs.length === 0) break;
    claimed += jobs.length;
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
        while (next < jobs.length) {
          const job = jobs[next++];
          if (job) await processJob(job);
        }
      }),
    );
    if (!options.drain) break;
  } while (claimed < limit);

  return {
    claimed,
    succeeded,
    retried,
    dead,
    lostLocks,
    recoveredLocks,
  };
}
