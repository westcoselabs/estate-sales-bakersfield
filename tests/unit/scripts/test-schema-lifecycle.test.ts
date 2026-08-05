import { describe, expect, it, vi } from "vitest";

import { runTestSchemaLifecycle } from "../../../scripts/test-schema-lifecycle";

describe("test schema lifecycle", () => {
  it("drops the exact schema after a successful command", async () => {
    const calls: string[] = [];
    const result = await runTestSchemaLifecycle({
      create: async () => void calls.push("create"),
      migrate: () => void calls.push("migrate"),
      run: async () => {
        calls.push("run");
        return 0;
      },
      drop: async () => void calls.push("drop"),
    });
    expect(result).toBe(0);
    expect(calls).toEqual(["create", "migrate", "run", "drop"]);
  });

  it("drops after command failure or interruption", async () => {
    const drop = vi.fn(async () => undefined);
    await expect(
      runTestSchemaLifecycle({
        create: async () => undefined,
        migrate: () => undefined,
        run: async () => {
          throw new Error("interrupted");
        },
        drop,
      }),
    ).rejects.toThrow("interrupted");
    expect(drop).toHaveBeenCalledOnce();
  });

  it("does not attempt a destructive drop when creation fails", async () => {
    const drop = vi.fn(async () => undefined);
    await expect(
      runTestSchemaLifecycle({
        create: async () => {
          throw new Error("create failed");
        },
        migrate: () => undefined,
        run: async () => 0,
        drop,
      }),
    ).rejects.toThrow("create failed");
    expect(drop).not.toHaveBeenCalled();
  });
});
