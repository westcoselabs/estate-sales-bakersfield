import type { DestinationStream } from "pino";
import { describe, expect, it } from "vitest";

import { createLogger } from "@/platform/observability/logger";

describe("structured logger", () => {
  it("redacts authentication credentials and token material", () => {
    const lines: string[] = [];
    const destination: DestinationStream = {
      write(message: string) {
        lines.push(message);
      },
    };
    const previous = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "info";
    try {
      createLogger({ component: "test" }, destination).info({
        authorization: "Bearer raw-authorization",
        headers: { cookie: "estate_session=raw-cookie" },
        password: "raw-password",
        resetToken: "raw-reset-token",
        safe: "retained",
      });
    } finally {
      if (previous === undefined) delete process.env.LOG_LEVEL;
      else process.env.LOG_LEVEL = previous;
    }

    const serialized = lines.join("");
    expect(serialized).toContain("retained");
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).not.toContain("raw-authorization");
    expect(serialized).not.toContain("raw-cookie");
    expect(serialized).not.toContain("raw-password");
    expect(serialized).not.toContain("raw-reset-token");
  });
});
