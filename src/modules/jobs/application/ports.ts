import type { DurableJob, EnqueueJobInput } from "../domain/types";

export interface DurableJobRepository {
  enqueue(input: EnqueueJobInput): Promise<DurableJob>;
  claim(input: {
    readonly queue: string;
    readonly workerId: string;
    readonly limit: number;
    readonly now: Date;
  }): Promise<readonly DurableJob[]>;
  complete(
    jobId: string,
    workerId: string,
    completedAt: Date,
  ): Promise<boolean>;
  fail(input: {
    readonly job: DurableJob;
    readonly workerId: string;
    readonly errorCode: string;
    readonly errorMessage: string;
    readonly retryAt: Date;
    readonly now: Date;
  }): Promise<"RETRY" | "DEAD" | "LOST_LOCK">;
  recoverStaleLocks(staleBefore: Date, retryAt: Date): Promise<number>;
}

export interface JobHandlerContext {
  readonly jobId: string;
  readonly attempt: number;
}

export type JobHandler = (
  payload: unknown,
  context: JobHandlerContext,
) => Promise<void>;
export type JobHandlerRegistry = Readonly<Record<string, JobHandler>>;
