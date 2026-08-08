import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  service: {
    editCandidate: vi.fn(),
    approveCandidate: vi.fn(),
    rejectCandidate: vi.fn(),
    deleteCandidate: vi.fn(),
    confirmCandidateLocation: vi.fn(),
    recomputeCandidateDuplicates: vi.fn(),
    resolveCandidateDuplicate: vi.fn(),
    editExternalListing: vi.fn(),
    removeExternalListing: vi.fn(),
  },
}));

vi.mock("@/app/api/admin/imports/_review-route", () => ({
  authorizeListingImportReview: mocks.authorize,
}));

vi.mock("@/modules/listing-imports", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createConfiguredListingImportReviewService: vi.fn(() => mocks.service),
}));

import * as approveCandidateRoute from "@/app/api/admin/imports/candidates/[candidateId]/approve/route";
import * as deleteCandidateRoute from "@/app/api/admin/imports/candidates/[candidateId]/delete/route";
import * as resolveDuplicateRoute from "@/app/api/admin/imports/candidates/[candidateId]/duplicates/[matchId]/resolve/route";
import * as recomputeDuplicatesRoute from "@/app/api/admin/imports/candidates/[candidateId]/duplicates/recompute/route";
import * as confirmLocationRoute from "@/app/api/admin/imports/candidates/[candidateId]/location/route";
import * as rejectCandidateRoute from "@/app/api/admin/imports/candidates/[candidateId]/reject/route";
import * as editCandidateRoute from "@/app/api/admin/imports/candidates/[candidateId]/route";
import * as removeExternalListingRoute from "@/app/api/admin/imports/listings/[listingId]/remove/route";
import * as editExternalListingRoute from "@/app/api/admin/imports/listings/[listingId]/route";
import { ListingImportReviewError } from "@/modules/listing-imports";

const candidateId = "10000000-0000-4000-8000-000000000001";
const matchId = "20000000-0000-4000-8000-000000000001";
const listingId = "30000000-0000-4000-8000-000000000001";
const requestId = "listing-import-review-route-unit";
const actor = {
  userId: "40000000-0000-4000-8000-000000000001",
  sessionId: "50000000-0000-4000-8000-000000000001",
} as const;

function request(path: string, method: "POST" | "PUT", body: string): Request {
  return new Request(`http://localhost:3000${path}`, {
    method,
    body,
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "x-request-id": requestId,
    },
  });
}

const successfulReview = { id: candidateId, version: 2 };

beforeEach(() => {
  mocks.authorize.mockReset();
  mocks.authorize.mockResolvedValue(actor);
  for (const operation of Object.values(mocks.service)) {
    operation.mockReset();
    operation.mockResolvedValue(successfulReview);
  }
});

describe("listing import candidate and listing review routes", () => {
  const body = { expectedVersion: 1, reason: "Reviewed by an administrator" };
  const bodyText = JSON.stringify(body);
  const cases = [
    {
      name: "candidate edit",
      operation: mocks.service.editCandidate,
      targetId: candidateId,
      schema: "listing-import-candidate.v1",
      invoke: (input: Request) =>
        editCandidateRoute.PUT(input, {
          params: Promise.resolve({ candidateId }),
        }),
      path: `/api/admin/imports/candidates/${candidateId}`,
      method: "PUT" as const,
      expectedArguments: [actor, candidateId, body, { requestId }],
    },
    {
      name: "candidate approval",
      operation: mocks.service.approveCandidate,
      targetId: candidateId,
      schema: "listing-import-candidate-approval.v1",
      invoke: (input: Request) =>
        approveCandidateRoute.POST(input, {
          params: Promise.resolve({ candidateId }),
        }),
      path: `/api/admin/imports/candidates/${candidateId}/approve`,
      method: "POST" as const,
      expectedArguments: [actor, candidateId, body, { requestId }],
    },
    {
      name: "candidate rejection",
      operation: mocks.service.rejectCandidate,
      targetId: candidateId,
      schema: "listing-import-candidate.v1",
      invoke: (input: Request) =>
        rejectCandidateRoute.POST(input, {
          params: Promise.resolve({ candidateId }),
        }),
      path: `/api/admin/imports/candidates/${candidateId}/reject`,
      method: "POST" as const,
      expectedArguments: [actor, candidateId, body, { requestId }],
    },
    {
      name: "candidate soft deletion",
      operation: mocks.service.deleteCandidate,
      targetId: candidateId,
      schema: "listing-import-candidate.v1",
      invoke: (input: Request) =>
        deleteCandidateRoute.POST(input, {
          params: Promise.resolve({ candidateId }),
        }),
      path: `/api/admin/imports/candidates/${candidateId}/delete`,
      method: "POST" as const,
      expectedArguments: [actor, candidateId, body, { requestId }],
    },
    {
      name: "candidate location confirmation",
      operation: mocks.service.confirmCandidateLocation,
      targetId: candidateId,
      schema: "listing-import-candidate.v1",
      invoke: (input: Request) =>
        confirmLocationRoute.POST(input, {
          params: Promise.resolve({ candidateId }),
        }),
      path: `/api/admin/imports/candidates/${candidateId}/location`,
      method: "POST" as const,
      expectedArguments: [actor, candidateId, body, { requestId }],
    },
    {
      name: "duplicate recomputation",
      operation: mocks.service.recomputeCandidateDuplicates,
      targetId: candidateId,
      schema: "listing-import-candidate.v1",
      invoke: (input: Request) =>
        recomputeDuplicatesRoute.POST(input, {
          params: Promise.resolve({ candidateId }),
        }),
      path: `/api/admin/imports/candidates/${candidateId}/duplicates/recompute`,
      method: "POST" as const,
      expectedArguments: [actor, candidateId, body, { requestId }],
    },
    {
      name: "duplicate resolution",
      operation: mocks.service.resolveCandidateDuplicate,
      targetId: candidateId,
      schema: "listing-import-duplicate-resolution.v1",
      invoke: (input: Request) =>
        resolveDuplicateRoute.POST(input, {
          params: Promise.resolve({ candidateId, matchId }),
        }),
      path: `/api/admin/imports/candidates/${candidateId}/duplicates/${matchId}/resolve`,
      method: "POST" as const,
      expectedArguments: [actor, candidateId, matchId, body, { requestId }],
    },
    {
      name: "external listing edit",
      operation: mocks.service.editExternalListing,
      targetId: listingId,
      schema: "external-listing-review.v1",
      invoke: (input: Request) =>
        editExternalListingRoute.PUT(input, {
          params: Promise.resolve({ listingId }),
        }),
      path: `/api/admin/imports/listings/${listingId}`,
      method: "PUT" as const,
      expectedArguments: [actor, listingId, body, { requestId }],
    },
    {
      name: "external listing removal",
      operation: mocks.service.removeExternalListing,
      targetId: listingId,
      schema: "external-listing-review.v1",
      invoke: (input: Request) =>
        removeExternalListingRoute.POST(input, {
          params: Promise.resolve({ listingId }),
        }),
      path: `/api/admin/imports/listings/${listingId}/remove`,
      method: "POST" as const,
      expectedArguments: [actor, listingId, body, { requestId }],
    },
  ] as const;

  it.each(cases)(
    "routes $name through the shared authorization and bounded review service",
    async (testCase) => {
      const input = request(testCase.path, testCase.method, bodyText);
      const response = await testCase.invoke(input);

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("private");
      expect(response.headers.get("x-robots-tag")).toContain("noindex");
      expect(response.headers.get("x-request-id")).toBe(requestId);
      await expect(response.json()).resolves.toMatchObject({
        schema: testCase.schema,
        requestId,
      });
      expect(mocks.authorize).toHaveBeenCalledWith(input, testCase.targetId);
      expect(testCase.operation).toHaveBeenCalledWith(
        ...testCase.expectedArguments,
      );
    },
  );

  it("exports only Node dynamic handlers for every review mutation", () => {
    const routes = [
      editCandidateRoute,
      approveCandidateRoute,
      rejectCandidateRoute,
      deleteCandidateRoute,
      confirmLocationRoute,
      recomputeDuplicatesRoute,
      resolveDuplicateRoute,
      editExternalListingRoute,
      removeExternalListingRoute,
    ];
    for (const route of routes) {
      expect(route.dynamic).toBe("force-dynamic");
      expect(route.runtime).toBe("nodejs");
    }
    expect(editCandidateRoute.PUT).toBeTypeOf("function");
    expect(editExternalListingRoute.PUT).toBeTypeOf("function");
    expect(approveCandidateRoute.POST).toBeTypeOf("function");
    expect(removeExternalListingRoute.POST).toBeTypeOf("function");
  });

  it("rejects an invalid route UUID before authorization or mutation", async () => {
    const response = await editCandidateRoute.PUT(
      request("/api/admin/imports/candidates/not-a-uuid", "PUT", bodyText),
      { params: Promise.resolve({ candidateId: "not-a-uuid" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      schema: "admin-error/v1",
      code: "INVALID_INPUT",
      error: "Please check the submitted information.",
    });
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(mocks.service.editCandidate).not.toHaveBeenCalled();
  });

  it("enforces the one-mebibyte bounded JSON reader before review mutation", async () => {
    const response = await editCandidateRoute.PUT(
      request(
        `/api/admin/imports/candidates/${candidateId}`,
        "PUT",
        "a".repeat(1_048_577),
      ),
      { params: Promise.resolve({ candidateId }) },
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      schema: "admin-error/v1",
      code: "PAYLOAD_TOO_LARGE",
      error: "The request body is too large.",
    });
    expect(mocks.authorize).toHaveBeenCalledOnce();
    expect(mocks.service.editCandidate).not.toHaveBeenCalled();
  });

  it("maps typed review conflicts to a bounded safe response", async () => {
    mocks.service.approveCandidate.mockRejectedValueOnce(
      new ListingImportReviewError(
        "STALE_VERSION",
        409,
        "The listing changed. Refresh and try again.",
      ),
    );
    const response = await approveCandidateRoute.POST(
      request(
        `/api/admin/imports/candidates/${candidateId}/approve`,
        "POST",
        bodyText,
      ),
      { params: Promise.resolve({ candidateId }) },
    );
    const responseBody = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(409);
    expect(responseBody).toEqual({
      schema: "admin-error/v1",
      code: "STALE_VERSION",
      error: "The listing changed. Refresh and try again.",
      requestId,
    });
    expect(responseBody).not.toHaveProperty("stack");
    expect(responseBody).not.toHaveProperty("cause");
  });
});
