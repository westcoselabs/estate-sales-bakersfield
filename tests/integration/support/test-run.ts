import { inject } from "vitest";

export function testRunId(): string {
  return inject("testRunId");
}

export function testEmail(label: string): string {
  return `${testRunId()}-${label}-${crypto.randomUUID()}@example.test`;
}

export function testQueue(label: string): string {
  return `${testRunId()}-${label}-${crypto.randomUUID().slice(0, 8)}`;
}
