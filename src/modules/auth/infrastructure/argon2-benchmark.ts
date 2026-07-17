import { performance } from "node:perf_hooks";

import {
  ARGON2_PARAMETERS,
  Argon2PasswordHasher,
} from "./argon2-password-hasher";

export interface Argon2BenchmarkResult {
  readonly runtime: string;
  readonly parameters: typeof ARGON2_PARAMETERS;
  readonly samplesMs: readonly number[];
  readonly p50Ms: number;
  readonly p95Ms: number;
}

export async function benchmarkArgon2(
  samples = 5,
): Promise<Argon2BenchmarkResult> {
  const hasher = new Argon2PasswordHasher();
  const durations: number[] = [];
  const samplePassword = "phase-one-benchmark-password";

  for (let index = 0; index < Math.min(Math.max(samples, 1), 10); index += 1) {
    const startedAt = performance.now();
    const encoded = await hasher.hash(samplePassword);
    durations.push(performance.now() - startedAt);
    if (!(await hasher.verify(encoded, samplePassword))) {
      throw new Error("Argon2 benchmark verification failed");
    }
  }

  durations.sort((left, right) => left - right);
  const percentile = (fraction: number) =>
    durations[
      Math.min(Math.ceil(durations.length * fraction) - 1, durations.length - 1)
    ] ?? 0;

  return {
    runtime: process.version,
    parameters: ARGON2_PARAMETERS,
    samplesMs: durations.map((value) => Number(value.toFixed(2))),
    p50Ms: Number(percentile(0.5).toFixed(2)),
    p95Ms: Number(percentile(0.95).toFixed(2)),
  };
}
