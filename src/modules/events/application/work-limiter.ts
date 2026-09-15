import type { EventOperation } from "../domain/resource-policy";

export interface EventWorkLimiter {
  consume(userId: string, operation: EventOperation): Promise<void>;
  acquireProcessing(): () => void;
}
