import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cleanupRateLimits: vi.fn(async () => 2),
  enqueueReconciliation: vi.fn(async () => 3),
  reconcileAttempt: vi.fn(),
  purgeLifecycleMedia: vi.fn(),
  expireExternalListing: vi.fn(),
  runJobBatch: vi.fn(),
}));

vi.mock("@/modules/auth", () => ({
  cleanupConfiguredAuthenticationRateLimits: mocks.cleanupRateLimits,
}));

vi.mock("@/modules/events", () => ({
  createConfiguredEventService: () => ({
    purgeLifecycleMedia: mocks.purgeLifecycleMedia,
  }),
}));

vi.mock("@/modules/listing-imports", () => ({
  EXTERNAL_LISTING_EXPIRATION_JOB_TYPE: "EXTERNAL_LISTING_EXPIRE",
  createConfiguredExternalListingLifecycleService: () => ({
    expire: mocks.expireExternalListing,
  }),
}));

vi.mock("@/modules/payments", () => ({
  createConfiguredPaymentService: () => ({
    enqueueReconciliationCandidates: mocks.enqueueReconciliation,
    reconcileAttempt: mocks.reconcileAttempt,
  }),
}));

vi.mock("@/modules/jobs", () => ({
  PrismaDurableJobRepository: class PrismaDurableJobRepository {},
  runJobBatch: mocks.runJobBatch,
}));

vi.mock("@/platform/database/client", () => ({
  getPrismaClient: () => ({}),
}));

import { runConfiguredJobBatch } from "@/platform/jobs/configured-runner";

describe("configured durable job runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runJobBatch.mockImplementation(
      async (
        _repository: unknown,
        handlers: Readonly<
          Record<
            string,
            (
              payload: unknown,
              context: { readonly jobId: string; readonly attempt: number },
            ) => Promise<void>
          >
        >,
      ) => {
        await handlers.EXTERNAL_LISTING_EXPIRE?.(
          {
            listingId: "10000000-0000-4000-8000-000000000001",
            version: 4,
            endsAt: "2026-08-08T22:00:00.000Z",
          },
          {
            jobId: "20000000-0000-4000-8000-000000000001",
            attempt: 1,
          },
        );
        return {
          claimed: 1,
          succeeded: 1,
          retried: 0,
          dead: 0,
          lostLocks: 0,
          recoveredLocks: 0,
        };
      },
    );
  });

  it("registers and invokes the external listing expiration handler", async () => {
    await expect(runConfiguredJobBatch(7)).resolves.toMatchObject({
      claimed: 1,
      succeeded: 1,
      rateLimitBucketsDeleted: 2,
      reconciliationCandidatesEnqueued: 3,
    });
    expect(mocks.expireExternalListing).toHaveBeenCalledWith(
      {
        listingId: "10000000-0000-4000-8000-000000000001",
        version: 4,
        endsAt: "2026-08-08T22:00:00.000Z",
      },
      { jobId: "20000000-0000-4000-8000-000000000001" },
    );
    expect(mocks.runJobBatch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        EXTERNAL_LISTING_EXPIRE: expect.any(Function),
      }),
      expect.objectContaining({ queue: "default", limit: 7 }),
    );
  });
});
