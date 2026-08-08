import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { LocationProvider } from "@/modules/locations/application/location-provider";
import type {
  LocationInput,
  ValidatedLocation,
} from "@/modules/locations/domain/types";
import type { ListingImportReviewService } from "@/modules/listing-imports/application/listing-import-review-service";
import type { ListingImportReviewRepositoryHooks } from "@/modules/listing-imports/infrastructure/prisma-listing-import-review-repository";

import { createIntegrationClient } from "./support/database";
import {
  createListingImportReviewHarness,
  type ListingImportReviewHarness,
  ReviewFixtureLocationProvider,
  type ReviewFixture,
} from "./support/listing-import-review-fixtures";

const prisma = createIntegrationClient();
const competitorPrisma = createIntegrationClient();

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

type Outcome<T> =
  | { readonly status: "fulfilled"; readonly value: T }
  | { readonly status: "rejected"; readonly reason: unknown };

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function settle<T>(operation: Promise<T>): Promise<Outcome<T>> {
  return operation.then(
    (value) => ({ status: "fulfilled", value }),
    (reason: unknown) => ({ status: "rejected", reason }),
  );
}

function expectErrorCode(
  outcome: Outcome<unknown>,
  expected: string | readonly string[],
): void {
  expect(outcome.status).toBe("rejected");
  if (outcome.status !== "rejected") return;
  const codes = Array.isArray(expected) ? expected : [expected];
  expect(outcome.reason).toMatchObject({
    code: expect.stringMatching(new RegExp(`^(${codes.join("|")})$`, "u")),
    status: expect.any(Number),
  });
}

function singlePauseHook(
  hook: "beforeAdministratorSessionCheck" | "approvalCheckpoint",
  checkpoint?: "CANDIDATE_APPROVED",
): {
  readonly hooks: ListingImportReviewRepositoryHooks;
  readonly reached: Promise<void>;
  readonly release: () => void;
} {
  const reached = deferred();
  const release = deferred();
  let paused = false;
  const pause = async (): Promise<void> => {
    if (paused) return;
    paused = true;
    reached.resolve();
    await release.promise;
  };
  const hooks: ListingImportReviewRepositoryHooks =
    hook === "beforeAdministratorSessionCheck"
      ? { beforeAdministratorSessionCheck: pause }
      : {
          approvalCheckpoint: async (current) => {
            if (current === checkpoint) await pause();
          },
        };
  return { hooks, reached: reached.promise, release: release.resolve };
}

class PausedLocationProvider implements LocationProvider {
  private readonly delegate = new ReviewFixtureLocationProvider();

  constructor(
    private readonly reached: Deferred,
    private readonly release: Deferred,
  ) {}

  async validate(input: LocationInput): Promise<ValidatedLocation> {
    this.reached.resolve();
    await this.release.promise;
    return this.delegate.validate(input);
  }
}

let harness: ListingImportReviewHarness;

beforeAll(async () => {
  harness = await createListingImportReviewHarness(prisma, {
    baseCalendarDate: "2095-01-01",
  });
});

afterAll(async () => {
  await Promise.all([prisma.$disconnect(), competitorPrisma.$disconnect()]);
});

async function approvedTargetAndDuplicate(label: string): Promise<{
  readonly duplicate: ReviewFixture;
  readonly duplicateCandidateId: string;
  readonly duplicateVersion: number;
  readonly matchId: string;
  readonly targetListingId: string;
}> {
  const target = harness.nextFixture(`${label} Target`);
  const targetCandidate = await harness.createCandidate(target);
  const targetConfirmed = await harness.confirmCandidate(
    targetCandidate.candidateId,
  );
  const targetApproved = await harness.reviews.approveCandidate(
    harness.actor(),
    targetCandidate.candidateId,
    { expectedVersion: targetConfirmed.version },
  );

  const duplicate = harness.nextFixture(`${label} Duplicate`, {
    content: target.content,
  });
  const duplicateCandidate = await harness.createCandidate(duplicate);
  const duplicateConfirmed = await harness.confirmCandidate(
    duplicateCandidate.candidateId,
  );
  const match = await prisma.listingDuplicateMatch.findFirstOrThrow({
    where: {
      candidateId: duplicateCandidate.candidateId,
      externalListingId: targetApproved.listingId,
    },
    select: { id: true },
  });
  return {
    duplicate,
    duplicateCandidateId: duplicateCandidate.candidateId,
    duplicateVersion: duplicateConfirmed.version,
    matchId: match.id,
    targetListingId: targetApproved.listingId,
  };
}

async function assertSinglePublication(
  candidateId: string,
  originalTitle: string,
  publicId: string,
): Promise<void> {
  const candidate = await prisma.listingImportCandidate.findUniqueOrThrow({
    where: { id: candidateId },
    select: { currentPayload: true, status: true, version: true },
  });
  expect(candidate).toMatchObject({
    currentPayload: { title: originalTitle },
    status: "APPROVED",
    version: 3,
  });
  const listings = await prisma.externalListing.findMany({
    where: { candidateId },
    select: {
      id: true,
      publicId: true,
      title: true,
      location: { select: { id: true } },
    },
  });
  expect(listings).toHaveLength(1);
  expect(listings[0]).toMatchObject({
    publicId,
    title: originalTitle,
    location: { id: expect.any(String) },
  });
  await expect(
    prisma.listingPublicIdReservation.findUniqueOrThrow({
      where: { publicId },
      select: { eventId: true, externalListingId: true },
    }),
  ).resolves.toEqual({
    eventId: null,
    externalListingId: listings[0]!.id,
  });
  await expect(prisma.event.count({ where: { publicId } })).resolves.toBe(0);
  await expect(
    prisma.auditEntry.count({
      where: {
        action: "LISTING_IMPORT_CANDIDATE_APPROVED",
        targetId: candidateId,
      },
    }),
  ).resolves.toBe(1);
}

describe("listing import review concurrency", () => {
  const competitors = [
    {
      label: "approval",
      run: (
        reviews: ListingImportReviewService,
        fixture: ReviewFixture,
        candidateId: string,
        version: number,
      ) =>
        reviews.approveCandidate(harness.actor(), candidateId, {
          expectedVersion: version,
        }),
    },
    {
      label: "candidate edit",
      run: (
        reviews: ListingImportReviewService,
        fixture: ReviewFixture,
        candidateId: string,
        version: number,
      ) =>
        reviews.editCandidate(
          harness.actor(),
          candidateId,
          harness.candidateEditInput(
            fixture,
            version,
            `${fixture.content.title} stale overwrite`,
          ),
        ),
    },
    {
      label: "rejection",
      run: (
        reviews: ListingImportReviewService,
        _fixture: ReviewFixture,
        candidateId: string,
        version: number,
      ) =>
        reviews.rejectCandidate(harness.actor(), candidateId, {
          expectedVersion: version,
          reason: "A concurrently stale rejection must not win.",
        }),
    },
    {
      label: "deletion",
      run: (
        reviews: ListingImportReviewService,
        _fixture: ReviewFixture,
        candidateId: string,
        version: number,
      ) =>
        reviews.deleteCandidate(harness.actor(), candidateId, {
          expectedVersion: version,
          reason: "A concurrently stale deletion must not win.",
          confirmation: "DELETE",
        }),
    },
  ] as const;

  it.each(competitors)(
    "serializes approval against $label without a silent overwrite",
    async ({ label, run }) => {
      const fixture = harness.nextFixture(`Approval Race ${label}`);
      const created = await harness.createCandidate(fixture);
      const confirmed = await harness.confirmCandidate(created.candidateId);
      const publicId = randomBytes(6).toString("hex");
      const pause = singlePauseHook("approvalCheckpoint", "CANDIDATE_APPROVED");
      const reviews = harness.createReviewService({
        hooks: pause.hooks,
        publicIdFactory: () => publicId,
      });
      const competingReviews = harness.createReviewService({
        prisma: competitorPrisma,
        publicIdFactory: () => publicId,
      });

      const approval = settle(
        reviews.approveCandidate(harness.actor(), created.candidateId, {
          expectedVersion: confirmed.version,
        }),
      );
      await pause.reached;
      const competitor = settle(
        run(competingReviews, fixture, created.candidateId, confirmed.version),
      );
      pause.release();

      const [approvalOutcome, competitorOutcome] = await Promise.all([
        approval,
        competitor,
      ]);
      expect(approvalOutcome).toMatchObject({
        status: "fulfilled",
        value: { status: "APPROVED", publicId },
      });
      expectErrorCode(competitorOutcome, "INVALID_LIFECYCLE");
      await assertSinglePublication(
        created.candidateId,
        fixture.content.title,
        publicId,
      );
    },
  );

  it("blocks approval while a concurrent NOT_DUPLICATE resolution is still uncommitted", async () => {
    const duplicate = await approvedTargetAndDuplicate(
      "Uncommitted Duplicate Resolution",
    );
    const pause = singlePauseHook("beforeAdministratorSessionCheck");
    const resolvingReviews = harness.createReviewService({
      hooks: pause.hooks,
      prisma: competitorPrisma,
    });
    const resolution = settle(
      resolvingReviews.resolveCandidateDuplicate(
        harness.actor(),
        duplicate.duplicateCandidateId,
        duplicate.matchId,
        {
          expectedVersion: duplicate.duplicateVersion,
          resolution: "NOT_DUPLICATE",
        },
      ),
    );
    await pause.reached;

    const approval = await settle(
      harness.reviews.approveCandidate(
        harness.actor(),
        duplicate.duplicateCandidateId,
        { expectedVersion: duplicate.duplicateVersion },
      ),
    );
    expectErrorCode(approval, "UNRESOLVED_DUPLICATES");
    pause.release();
    await expect(resolution).resolves.toMatchObject({
      status: "fulfilled",
      value: {
        resolution: "NOT_DUPLICATE",
        status: "PENDING_REVIEW",
        version: duplicate.duplicateVersion + 1,
      },
    });
    await expect(
      prisma.externalListing.count({
        where: { candidateId: duplicate.duplicateCandidateId },
      }),
    ).resolves.toBe(0);
  });

  it("rejects stale approval after a concurrent NOT_DUPLICATE resolution advances the candidate", async () => {
    const duplicate = await approvedTargetAndDuplicate(
      "Committed Duplicate Resolution",
    );
    const pause = singlePauseHook("beforeAdministratorSessionCheck");
    const approvingReviews = harness.createReviewService({
      hooks: pause.hooks,
      prisma: competitorPrisma,
    });
    const approval = settle(
      approvingReviews.approveCandidate(
        harness.actor(),
        duplicate.duplicateCandidateId,
        { expectedVersion: duplicate.duplicateVersion },
      ),
    );
    await pause.reached;

    const resolution = await harness.reviews.resolveCandidateDuplicate(
      harness.actor(),
      duplicate.duplicateCandidateId,
      duplicate.matchId,
      {
        expectedVersion: duplicate.duplicateVersion,
        resolution: "NOT_DUPLICATE",
      },
    );
    expect(resolution).toMatchObject({
      resolution: "NOT_DUPLICATE",
      status: "PENDING_REVIEW",
      version: duplicate.duplicateVersion + 1,
    });
    pause.release();
    expectErrorCode(await approval, "STALE_VERSION");
    await expect(
      prisma.externalListing.count({
        where: { candidateId: duplicate.duplicateCandidateId },
      }),
    ).resolves.toBe(0);
  });

  it("rolls back every approval write when failure is injected after location creation", async () => {
    const fixture = harness.nextFixture("Approval Rollback");
    const created = await harness.createCandidate(fixture);
    const confirmed = await harness.confirmCandidate(created.candidateId);
    const publicId = randomBytes(6).toString("hex");
    const injectedFailure = new Error("injected approval checkpoint failure");
    const reviews = harness.createReviewService({
      publicIdFactory: () => publicId,
      hooks: {
        approvalCheckpoint(checkpoint) {
          if (checkpoint === "LOCATION_CREATED") throw injectedFailure;
        },
      },
    });

    const outcome = await settle(
      reviews.approveCandidate(harness.actor(), created.candidateId, {
        expectedVersion: confirmed.version,
      }),
    );
    expect(outcome).toEqual({
      status: "rejected",
      reason: injectedFailure,
    });
    await expect(
      prisma.listingImportCandidate.findUniqueOrThrow({
        where: { id: created.candidateId },
        select: { status: true, version: true },
      }),
    ).resolves.toEqual({
      status: "PENDING_REVIEW",
      version: confirmed.version,
    });
    await expect(
      prisma.externalListing.count({
        where: { candidateId: created.candidateId },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.externalListingLocation.count({
        where: { listing: { publicId } },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.listingPublicIdReservation.count({ where: { publicId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.auditEntry.count({
        where: {
          action: "LISTING_IMPORT_CANDIDATE_APPROVED",
          targetId: created.candidateId,
        },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.listingSourceRecord.findFirstOrThrow({
        where: { candidate: { id: created.candidateId } },
        select: { linkedEventId: true, linkedExternalListingId: true },
      }),
    ).resolves.toEqual({
      linkedEventId: null,
      linkedExternalListingId: null,
    });
  });
});

describe("listing import review session-revocation races", () => {
  async function revokeBeforeAdministratorCheck<T>(
    operation: (
      reviews: ListingImportReviewService,
      sessionId: string,
    ) => Promise<T>,
  ): Promise<Outcome<T>> {
    const sessionId = await harness.createSession();
    const pause = singlePauseHook("beforeAdministratorSessionCheck");
    const reviews = harness.createReviewService({
      hooks: pause.hooks,
      prisma: competitorPrisma,
    });
    const outcome = settle(operation(reviews, sessionId));
    await pause.reached;
    await prisma.session.delete({ where: { id: sessionId } });
    pause.release();
    return outcome;
  }

  it("does not edit a candidate after its exact administrator session is revoked", async () => {
    const fixture = harness.nextFixture("Revoked Candidate Edit");
    const created = await harness.createCandidate(fixture);
    const outcome = await revokeBeforeAdministratorCheck((reviews, sessionId) =>
      reviews.editCandidate(
        harness.actor(sessionId),
        created.candidateId,
        harness.candidateEditInput(
          fixture,
          1,
          `${fixture.content.title} unauthorized edit`,
        ),
      ),
    );
    expectErrorCode(outcome, "ACTOR_NOT_AUTHORIZED");
    await expect(
      prisma.listingImportCandidate.findUniqueOrThrow({
        where: { id: created.candidateId },
        select: { currentPayload: true, version: true },
      }),
    ).resolves.toMatchObject({
      currentPayload: { title: fixture.content.title },
      version: 1,
    });
  });

  it("rechecks the session after asynchronous location validation before confirming", async () => {
    const fixture = harness.nextFixture("Revoked Location Confirmation");
    const created = await harness.createCandidate(fixture);
    const sessionId = await harness.createSession();
    const reached = deferred();
    const release = deferred();
    const reviews = harness.createReviewService({
      locationProvider: new PausedLocationProvider(reached, release),
      prisma: competitorPrisma,
    });
    const outcome = settle(
      reviews.confirmCandidateLocation(
        harness.actor(sessionId),
        created.candidateId,
        { expectedVersion: 1 },
      ),
    );
    await reached.promise;
    await prisma.session.delete({ where: { id: sessionId } });
    release.resolve();
    expectErrorCode(await outcome, "ACTOR_NOT_AUTHORIZED");
    await expect(
      prisma.listingImportCandidate.findUniqueOrThrow({
        where: { id: created.candidateId },
        select: {
          latitude: true,
          longitude: true,
          locationConfirmationStatus: true,
          locationConfirmedByUserId: true,
          version: true,
        },
      }),
    ).resolves.toEqual({
      latitude: null,
      longitude: null,
      locationConfirmationStatus: "UNCONFIRMED",
      locationConfirmedByUserId: null,
      version: 1,
    });
  });

  it("does not resolve a duplicate after its exact administrator session is revoked", async () => {
    const duplicate = await approvedTargetAndDuplicate(
      "Revoked Duplicate Resolution",
    );
    const outcome = await revokeBeforeAdministratorCheck((reviews, sessionId) =>
      reviews.resolveCandidateDuplicate(
        harness.actor(sessionId),
        duplicate.duplicateCandidateId,
        duplicate.matchId,
        {
          expectedVersion: duplicate.duplicateVersion,
          resolution: "NOT_DUPLICATE",
        },
      ),
    );
    expectErrorCode(outcome, "ACTOR_NOT_AUTHORIZED");
    await expect(
      prisma.listingDuplicateMatch.findUniqueOrThrow({
        where: { id: duplicate.matchId },
        select: { resolution: true, resolvedAt: true },
      }),
    ).resolves.toEqual({ resolution: "UNRESOLVED", resolvedAt: null });
    await expect(
      prisma.listingImportCandidate.findUniqueOrThrow({
        where: { id: duplicate.duplicateCandidateId },
        select: { status: true, version: true },
      }),
    ).resolves.toEqual({
      status: "PENDING_REVIEW",
      version: duplicate.duplicateVersion,
    });
  });

  it("does not edit an external listing after its exact administrator session is revoked", async () => {
    const fixture = harness.nextFixture("Revoked External Listing Edit");
    const created = await harness.createCandidate(fixture);
    const confirmed = await harness.confirmCandidate(created.candidateId);
    const approved = await harness.reviews.approveCandidate(
      harness.actor(),
      created.candidateId,
      { expectedVersion: confirmed.version },
    );
    const outcome = await revokeBeforeAdministratorCheck((reviews, sessionId) =>
      reviews.editExternalListing(
        harness.actor(sessionId),
        approved.listingId,
        harness.externalEditInput(
          fixture,
          approved.listingVersion,
          `${fixture.content.title} unauthorized edit`,
        ),
      ),
    );
    expectErrorCode(outcome, "ACTOR_NOT_AUTHORIZED");
    await expect(
      prisma.externalListing.findUniqueOrThrow({
        where: { id: approved.listingId },
        select: { title: true, version: true },
      }),
    ).resolves.toEqual({
      title: fixture.content.title,
      version: approved.listingVersion,
    });
  });
});
