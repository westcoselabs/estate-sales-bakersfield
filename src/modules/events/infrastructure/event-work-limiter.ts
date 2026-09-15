import "server-only";

import type { PrismaAuthenticationRateLimiter } from "@/modules/auth";

import type { EventWorkLimiter } from "../application/work-limiter";
import { EventResourceLimitError } from "../domain/errors";
import {
  EVENT_OPERATION_LIMITS,
  type EventOperation,
} from "../domain/resource-policy";

export class DatabaseEventWorkLimiter implements EventWorkLimiter {
  constructor(private readonly limiter: PrismaAuthenticationRateLimiter) {}

  acquireProcessing(): () => void {
    if (activeImageProcesses >= 1) {
      throw new EventResourceLimitError(
        "Image processing is busy. Please retry this photo shortly.",
        "PROCESSING_BUSY",
        5,
      );
    }
    activeImageProcesses += 1;
    let released = false;
    return () => {
      if (!released) activeImageProcesses -= 1;
      released = true;
    };
  }

  async consume(userId: string, operation: EventOperation): Promise<void> {
    try {
      const decision = await this.limiter.consume({
        namespace: `event-work:${operation}`,
        identifier: userId,
        ...EVENT_OPERATION_LIMITS[operation],
      });
      if (!decision.allowed) {
        throw new EventResourceLimitError(
          "Please wait before starting more listing work.",
          "RATE_LIMITED",
          decision.retryAfterSeconds,
        );
      }
    } catch (error) {
      if (error instanceof EventResourceLimitError) throw error;
      throw new EventResourceLimitError(
        "Listing protection is temporarily unavailable. Please try again.",
        "LIMITER_UNAVAILABLE",
        30,
      );
    }
  }
}

// Shared by every service instance in this warm runtime. Reject excess native
// processing instead of buffering uploads in memory while waiting for a slot.
let activeImageProcesses = 0;
