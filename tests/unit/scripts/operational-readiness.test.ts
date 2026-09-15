import { describe, it, expect, vi } from "vitest";
import { inspectOperationalReadiness } from "../../../scripts/operational-readiness";

const zero = {
  deadJobs: 0,
  failedResendWebhooks: 0,
  manualReviewPayments: 0,
  blockedPaidPayments: 0,
  overdueJobs: 0,
};
describe("operational monitor", () => {
  it.each([
    [200, "ready", zero, "ready"],
    [200, "warning", { ...zero, overdueJobs: 1 }, "needs-attention"],
    [200, "ready", {}, "needs-attention"],
    [503, "unavailable", zero, "needs-attention"],
    [401, "ready", zero, "needs-attention"],
  ])(
    "handles HTTP %i and body %s",
    async (status, state, warnings, expected) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json({ status: "ok" }))
        .mockResolvedValueOnce(
          Response.json({ status: state, warnings }, { status }),
        );
      expect(
        (
          await inspectOperationalReadiness(
            "https://example.test",
            "test-secret-for-monitor",
            fetcher,
          )
        ).status,
      ).toBe(expected);
      expect(fetcher.mock.calls[0]![1]?.headers).toEqual({});
      expect(fetcher.mock.calls[1]![1]).toMatchObject({
        headers: { authorization: "Bearer test-secret-for-monitor" },
        redirect: "error",
      });
    },
  );
  it("rejects insecure origins before sending a secret", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      inspectOperationalReadiness(
        "http://example.test",
        "test-secret-for-monitor",
        fetcher,
      ),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("fails closed on network failures", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("credential-sensitive provider detail"));
    const result = await inspectOperationalReadiness(
      "https://example.test",
      "test-secret-for-monitor",
      fetcher,
    );
    expect(result.status).toBe("needs-attention");
    expect(JSON.stringify(result)).not.toContain("credential-sensitive");
  });
});
