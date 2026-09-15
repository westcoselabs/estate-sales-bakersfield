import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(async () => [{ value: 1 }]),
  jobs: vi.fn(),
  payments: vi.fn(),
  webhooks: vi.fn(async () => 0),
}));
vi.mock("@/platform/config/env", () => ({
  getServerEnvironment: () => ({
    CRON_SECRET: "readiness-test-secret",
    JOB_MAX_QUEUE_DELAY_MINUTES: 1500,
  }),
}));
vi.mock("@/platform/database/client", () => ({
  getPrismaClient: () => ({
    $queryRaw: mocks.query,
    durableJob: { count: mocks.jobs },
    paymentAttempt: { count: mocks.payments },
    resendWebhookEvent: { count: mocks.webhooks },
  }),
}));
import { GET } from "@/app/api/internal/readiness/route";

describe("protected queue and payment readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.jobs.mockResolvedValue(0);
    mocks.payments.mockResolvedValue(0);
  });

  it("does not inspect private operations for an unauthorized request", async () => {
    const response = await GET(
      new Request("https://example.test/api/internal/readiness"),
    );
    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("warns about paid blocked fulfillment and overdue pending/running jobs", async () => {
    const startedAt = Date.now();
    mocks.jobs.mockResolvedValueOnce(0).mockResolvedValueOnce(4);
    mocks.payments.mockResolvedValueOnce(0).mockResolvedValueOnce(2);
    const response = await GET(
      new Request("https://example.test/api/internal/readiness", {
        headers: { authorization: "Bearer readiness-test-secret" },
      }),
    );
    expect(await response.json()).toMatchObject({
      status: "warning",
      warnings: { blockedPaidPayments: 2, overdueJobs: 4 },
    });
    expect(mocks.payments).toHaveBeenCalledWith({
      where: { paymentState: "PAID", fulfillmentState: "BLOCKED" },
    });
    expect(mocks.jobs).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            status: { in: ["PENDING", "FAILED"] },
            runAt: { lt: expect.any(Date) },
          },
          { status: "RUNNING", lockedAt: { lt: expect.any(Date) } },
        ],
      },
    });
    const criteria = mocks.jobs.mock.calls[1]![0].where.OR;
    expect(criteria[0].runAt.lt.getTime()).toBeGreaterThanOrEqual(
      startedAt - 1500 * 60_000,
    );
    expect(criteria[0].runAt.lt.getTime()).toBeLessThanOrEqual(
      Date.now() - 1500 * 60_000,
    );
    expect(
      criteria[1].lockedAt.lt.getTime() - criteria[0].runAt.lt.getTime(),
    ).toBe((1500 - 15) * 60_000);
  });
});
