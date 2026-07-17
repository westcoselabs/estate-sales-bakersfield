export type DurableJobStatus =
  "PENDING" | "RUNNING" | "FAILED" | "SUCCEEDED" | "DEAD";

export interface DurableJob {
  readonly id: string;
  readonly queue: string;
  readonly type: string;
  readonly payload: unknown;
  readonly status: DurableJobStatus;
  readonly runAt: Date;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly lockedBy: string | null;
}

export interface EnqueueJobInput {
  readonly queue: string;
  readonly type: string;
  readonly payload: unknown;
  readonly deduplicationKey?: string;
  readonly runAt?: Date;
  readonly maxAttempts?: number;
}
