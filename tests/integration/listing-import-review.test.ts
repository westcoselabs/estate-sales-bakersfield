import { createHash, randomBytes, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { AuthPrincipal } from "@/modules/auth";
import { approvalDigest } from "@/modules/events/application/approval";
import {
  futurePublicEventProjection,
  PUBLISHING_TERMS_VERSION,
} from "@/modules/events/application/policy";
import { PrismaEventRepository } from "@/modules/events/infrastructure/prisma-event-repository";
import type {
  LocationInput,
  ValidatedLocation,
} from "@/modules/locations/domain/types";
import type { LocationProvider } from "@/modules/locations/application/location-provider";
import { listingContentHash } from "@/modules/listing-imports/application/content-hash";
import { ListingImportService } from "@/modules/listing-imports/application/listing-import-service";
import { ListingImportReviewService } from "@/modules/listing-imports/application/listing-import-review-service";
import type { ListingImportReviewActor } from "@/modules/listing-imports/application/review-ports";
import {
  normalizeListingContent,
  normalizedFullAddress,
} from "@/modules/listing-imports/domain/normalization";
import { PrismaListingImportRepository } from "@/modules/listing-imports/infrastructure/prisma-listing-import-repository";
import { PrismaListingImportReviewRepository } from "@/modules/listing-imports/infrastructure/prisma-listing-import-review-repository";
import { PaymentService } from "@/modules/payments/application/payment-service";
import type { PublicationPrice } from "@/modules/payments/domain/types";
import {
  completeFakeCheckout,
  FakeStripeProvider,
} from "@/modules/payments/infrastructure/fake-stripe-provider";
import { PrismaPaymentRepository } from "@/modules/payments/infrastructure/prisma-payment-repository";

import { createIntegrationClient } from "./support/database";
import { testEmail, testRunId } from "./support/test-run";

const prisma = createIntegrationClient();
const imports = new ListingImportService(
  new PrismaListingImportRepository(prisma),
  "test",
);
const events = new PrismaEventRepository(prisma);
const payments = new PrismaPaymentRepository(prisma);

class FixtureLocationProvider implements LocationProvider {
  validate(input: LocationInput): Promise<ValidatedLocation> {
    return Promise.resolve({
      ...input,
      normalizedAddress: `${input.addressLine1}, ${input.city}, ${input.region} ${input.postalCode}, ${input.countryCode}`,
      latitude: 35.373292,
      longitude: -119.018712,
      providerPlaceId: `review-fixture-${input.postalCode}`,
      providerName: "integration-fixture",
      precision: "exact",
      confidence: 1,
      validationStatus: "VERIFIED",
    });
  }
}

const reviews = new ListingImportReviewService(
  new PrismaListingImportReviewRepository(prisma, () =>
    randomBytes(6).toString("hex"),
  ),
  new FixtureLocationProvider(),
);

interface FixtureContent {
  readonly eventType: "ESTATE_SALE";
  readonly title: string;
  readonly description: string;
  readonly localStartsAt: string;
  readonly localEndsAt: string;
  readonly timezone: "America/Los_Angeles";
  readonly addressLine1: string;
  readonly addressLine2: null;
  readonly city: "Bakersfield";
  readonly region: "CA";
  readonly postalCode: "93301";
  readonly countryCode: "US";
  readonly privacyMode: "APPROXIMATE_LOCATION";
}

interface ReviewFixture {
  readonly sourceListingId: string;
  readonly sourceUrl: string;
  readonly content: FixtureContent;
  readonly normalized: ReturnType<typeof normalizeListingContent>;
}

let administratorId: string;
let administratorSessionId: string;
let staleAdministratorSessionId: string;
let organizerId: string;
let organizerPrincipal: AuthPrincipal;
let fixtureSequence = 0;

function identifier(label: string): string {
  return `${testRunId()}-${label}-${randomUUID().slice(0, 8)}`;
}

function publicId(): string {
  return randomBytes(6).toString("hex");
}

function actor(sessionId = administratorSessionId): ListingImportReviewActor {
  return { userId: administratorId, sessionId };
}

function nextFixture(label: string): ReviewFixture {
  fixtureSequence += 1;
  const calendarDate = new Date(Date.UTC(2028, 0, 1 + fixtureSequence * 3))
    .toISOString()
    .slice(0, 10);
  const sourceListingId = identifier(label);
  const content: FixtureContent = {
    eventType: "ESTATE_SALE",
    title: `${label} Estate Sale ${String(fixtureSequence)}`,
    description:
      "A deterministic imported listing with furniture, books, art, and household goods for review.",
    localStartsAt: `${calendarDate}T09:00`,
    localEndsAt: `${calendarDate}T15:00`,
    timezone: "America/Los_Angeles",
    addressLine1: `${String(1000 + fixtureSequence)} Review Avenue`,
    addressLine2: null,
    city: "Bakersfield",
    region: "CA",
    postalCode: "93301",
    countryCode: "US",
    privacyMode: "APPROXIMATE_LOCATION",
  };
  return {
    sourceListingId,
    sourceUrl: `https://fixture.invalid/listings/${sourceListingId}`,
    content,
    normalized: normalizeListingContent(content),
  };
}

function candidateEditInput(
  fixture: ReviewFixture,
  expectedVersion: number,
  title = fixture.content.title,
) {
  return { expectedVersion, ...fixture.content, title };
}

function externalEditInput(
  fixture: ReviewFixture,
  expectedVersion: number,
  title: string,
) {
  const { content } = fixture;
  return {
    expectedVersion,
    eventType: content.eventType,
    title,
    description: content.description,
    localStartsAt: content.localStartsAt,
    localEndsAt: content.localEndsAt,
    timezone: content.timezone,
    privacyMode: content.privacyMode,
  };
}

async function createCandidate(fixture: ReviewFixture): Promise<string> {
  const result = await imports.importBatch(
    {
      contractVersion: "listing-import.v1",
      sourceKey: "fixture",
      ingestorRunId: identifier("review-run"),
      ingestorInstanceId: `${testRunId()}-review-integration`,
      parserVersion: "review-integration@1.0.0",
      items: [
        {
          sourceListingId: fixture.sourceListingId,
          sourceUrl: fixture.sourceUrl,
          retrievedAt: "2026-08-07T16:00:00.000Z",
          contentHash: listingContentHash(fixture.normalized),
          ...fixture.content,
        },
      ],
    },
    {
      transport: "MANUAL_JSON",
      actor: { kind: "ADMIN_USER", adminUserId: administratorId },
      audit: { requestId: identifier("import-request") },
    },
  );
  const candidateId = result.rows[0]?.candidateId;
  if (!candidateId)
    throw new Error("Review fixture did not create a candidate");
  return candidateId;
}

async function confirmCandidate(candidateId: string, expectedVersion = 1) {
  return reviews.confirmCandidateLocation(
    actor(),
    candidateId,
    { expectedVersion },
    { requestId: identifier("confirm-location") },
  );
}

async function createOrganizerEvent(
  fixture: ReviewFixture,
  eventPublicId = publicId(),
) {
  const { content, normalized } = fixture;
  const event = await prisma.event.create({
    data: {
      organizerId,
      publicId: eventPublicId,
      slug: `review-event-${eventPublicId}`,
      title: content.title,
      description: content.description,
      eventType: content.eventType,
      origin: "OWNER_CREATED",
      localStartsAt: content.localStartsAt,
      localEndsAt: content.localEndsAt,
      startsAt: normalized.startsAt,
      endsAt: normalized.endsAt,
      timezone: content.timezone,
      privacyMode: content.privacyMode,
      workflowState: "PREVIEW_READY",
    },
  });
  await prisma.$executeRaw`
    INSERT INTO "event_locations" (
      "event_id", "address_line_1", "address_line_2", "city", "region",
      "postal_code", "country_code", "normalized_address", "latitude",
      "longitude", "coordinates", "timezone", "provider_place_id",
      "provider_name", "provider_version", "provider_attribution",
      "resolution_source", "confirmation_status", "confirmed_by_user_id",
      "confirmed_at", "public_zone", "precision", "confidence",
      "validation_status", "updated_at"
    ) VALUES (
      ${event.id}::uuid, ${content.addressLine1}, ${content.addressLine2},
      ${content.city}, ${content.region}, ${content.postalCode},
      ${content.countryCode}, ${normalizedFullAddress(content)}, 35.373292,
      -119.018712,
      ST_SetSRID(ST_MakePoint(-119.018712, 35.373292), 4326)::geography,
      ${content.timezone}, ${`organizer-${eventPublicId}`},
      'integration-fixture', 'v1', 'Deterministic integration fixture',
      'ORGANIZER_AUTOCOMPLETE', 'CONFIRMED',
      ${organizerPrincipal.id}::uuid, CURRENT_TIMESTAMP, 'bakersfield',
      'exact', 1, 'VERIFIED', CURRENT_TIMESTAMP
    )
  `;
  return event;
}

const applicationUrl = new URL("http://127.0.0.1:3417");
const publicationPrice: PublicationPrice = {
  priceId: "price_listing_import_review_fixture",
  amount: 1234,
  currency: "usd",
  fixture: true,
};

async function createPublishedOrganizerEvent(
  fixture: ReviewFixture,
): Promise<string> {
  const event = await createOrganizerEvent(fixture);
  const photo = await prisma.eventPhoto.create({
    data: {
      eventId: event.id,
      status: "READY",
      sortOrder: 0,
      dashboardThumbnailKey: `review/${event.id}/thumbnail.webp`,
      listingCardKey: `review/${event.id}/card.webp`,
      galleryKey: `review/${event.id}/gallery.webp`,
      coverDisplayKey: `review/${event.id}/cover.webp`,
      dashboardThumbnailHash: "a".repeat(64),
      listingCardHash: "b".repeat(64),
      galleryHash: "c".repeat(64),
      coverDisplayHash: "d".repeat(64),
      sourceContentType: "image/jpeg",
      sourceSize: 1024,
      width: 1200,
      height: 800,
      readyAt: new Date(),
    },
  });
  await prisma.event.update({
    where: { id: event.id },
    data: { coverPhotoId: photo.id },
  });
  const draft = await events.findOwned(event.id, organizerPrincipal.id);
  if (!draft) throw new Error("Organizer fixture event was not readable");
  const digest = approvalDigest(draft, futurePublicEventProjection(draft));
  const approvedAt = new Date();
  const approval = await prisma.eventApproval.create({
    data: {
      eventId: event.id,
      organizerId,
      acceptedByUserId: organizerPrincipal.id,
      contentRevision: draft.contentRevision,
      approvalDigest: digest,
      termsVersion: PUBLISHING_TERMS_VERSION,
      termsAcceptedAt: approvedAt,
      approvedAt,
    },
  });
  await prisma.event.update({
    where: { id: event.id },
    data: {
      workflowState: "APPROVED_FOR_PAYMENT",
      approvalStatus: "APPROVED",
      approvedRevision: draft.contentRevision,
      approvalDigest: digest,
      approvedAt,
      termsVersion: approval.termsVersion,
      termsAcceptedAt: approvedAt,
      termsAcceptedByUserId: organizerPrincipal.id,
      currentApprovalId: approval.id,
    },
  });
  const approved = await events.findOwned(event.id, organizerPrincipal.id);
  if (!approved) throw new Error("Approved organizer event was not readable");
  const paymentsService = new PaymentService(
    payments,
    events,
    new FakeStripeProvider(applicationUrl, publicationPrice),
    publicationPrice,
    "test",
    applicationUrl,
    { revalidate: vi.fn() },
  );
  const checkout = await paymentsService.createCheckout(
    organizerPrincipal,
    approved.id,
    approved.version,
  );
  const attempt = await payments.findAttemptById(checkout.attemptId);
  if (!attempt?.stripeCheckoutSessionId) {
    throw new Error("Organizer fixture checkout was not attached");
  }
  const webhook = completeFakeCheckout(attempt.stripeCheckoutSessionId);
  await paymentsService.handleWebhook(webhook.body, webhook.signature);
  await prisma.eventPublication.findUniqueOrThrow({
    where: { eventId: event.id },
  });
  return event.id;
}

async function createApprovedExternalListing(fixture: ReviewFixture) {
  const candidateId = await createCandidate(fixture);
  const confirmed = await confirmCandidate(candidateId);
  return reviews.approveCandidate(
    actor(),
    candidateId,
    { expectedVersion: confirmed.version },
    { requestId: identifier("approve") },
  );
}

beforeAll(async () => {
  const existingAdministrator = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
    select: { id: true },
  });
  const administrator =
    existingAdministrator ??
    (await (async () => {
      const administratorEmail = testEmail("listing-import-review-admin");
      return prisma.user.create({
        data: {
          displayName: "Listing Import Review Administrator",
          email: administratorEmail,
          normalizedEmail: administratorEmail,
          passwordHash: "integration-test-password-hash",
          emailVerifiedAt: new Date(),
          role: "SUPER_ADMIN",
        },
        select: { id: true },
      });
    })());
  administratorId = administrator.id;
  const now = new Date();
  const currentSession = await prisma.session.create({
    data: {
      userId: administrator.id,
      tokenHash: createHash("sha256")
        .update(identifier("current-admin-session"), "utf8")
        .digest("hex"),
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      passwordAuthenticatedAt: now,
    },
  });
  administratorSessionId = currentSession.id;
  const staleSession = await prisma.session.create({
    data: {
      userId: administrator.id,
      tokenHash: createHash("sha256")
        .update(identifier("stale-admin-session"), "utf8")
        .digest("hex"),
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      passwordAuthenticatedAt: new Date(now.getTime() - 20 * 60 * 1000),
    },
  });
  staleAdministratorSessionId = staleSession.id;

  const organizerEmail = testEmail("listing-import-review-organizer");
  const organizer = await prisma.user.create({
    data: {
      displayName: "Review Fixture Organizer",
      email: organizerEmail,
      normalizedEmail: organizerEmail,
      passwordHash: "integration-test-password-hash",
      emailVerifiedAt: new Date(),
      organizerProfile: {
        create: {
          displayName: "Review Fixture Sales",
          contactName: "Review Fixture Organizer",
          contactEmail: organizerEmail,
          status: "COMPLETE",
        },
      },
    },
    include: { organizerProfile: true },
  });
  organizerId = organizer.organizerProfile!.id;
  organizerPrincipal = {
    id: organizer.id,
    displayName: organizer.displayName,
    email: organizer.email,
    emailVerifiedAt: organizer.emailVerifiedAt,
    role: organizer.role,
    status: organizer.status,
  };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("listing import Phase 4 review lifecycle", () => {
  it("enforces optimistic candidate versions", async () => {
    const fixture = nextFixture("Optimistic Review");
    const candidateId = await createCandidate(fixture);
    const updated = await reviews.editCandidate(
      actor(),
      candidateId,
      candidateEditInput(fixture, 1, `${fixture.content.title} Updated`),
    );
    expect(updated).toMatchObject({ version: 2, status: "PENDING_REVIEW" });

    await expect(
      reviews.editCandidate(
        actor(),
        candidateId,
        candidateEditInput(fixture, 1, `${fixture.content.title} Stale`),
      ),
    ).rejects.toMatchObject({ code: "STALE_VERSION", status: 409 });
    await expect(
      prisma.listingImportCandidate.findUniqueOrThrow({
        where: { id: candidateId },
        select: { version: true },
      }),
    ).resolves.toEqual({ version: 2 });
  });

  it("clears confirmed location evidence after an address and timezone edit", async () => {
    const fixture = nextFixture("Location Reset");
    const candidateId = await createCandidate(fixture);
    const confirmed = await confirmCandidate(candidateId);
    await expect(
      prisma.listingImportCandidate.findUniqueOrThrow({
        where: { id: candidateId },
        select: {
          locationConfirmationStatus: true,
          latitude: true,
          longitude: true,
          locationProviderPlaceId: true,
          locationProviderName: true,
        },
      }),
    ).resolves.toMatchObject({
      locationConfirmationStatus: "CONFIRMED",
      latitude: expect.anything(),
      longitude: expect.anything(),
      locationProviderPlaceId: expect.any(String),
      locationProviderName: "integration-fixture",
    });

    const updatedAddress = "8800 Reset Location Boulevard";
    const updated = await reviews.editCandidate(actor(), candidateId, {
      ...candidateEditInput(fixture, confirmed.version),
      addressLine1: updatedAddress,
      timezone: "America/Denver",
    });
    expect(updated).toMatchObject({ version: 3, status: "PENDING_REVIEW" });
    await expect(
      prisma.listingImportCandidate.findUniqueOrThrow({
        where: { id: candidateId },
        select: {
          currentPayload: true,
          latitude: true,
          longitude: true,
          locationProviderPlaceId: true,
          locationProviderName: true,
          locationProviderVersion: true,
          locationProviderAttribution: true,
          locationResolutionSource: true,
          locationConfirmationStatus: true,
          locationConfirmedByUserId: true,
          locationConfirmedAt: true,
        },
      }),
    ).resolves.toMatchObject({
      currentPayload: {
        addressLine1: updatedAddress,
        timezone: "America/Denver",
        locationResolution: null,
      },
      latitude: null,
      longitude: null,
      locationProviderPlaceId: null,
      locationProviderName: null,
      locationProviderVersion: null,
      locationProviderAttribution: null,
      locationResolutionSource: "UNCONFIRMED_DRAFT",
      locationConfirmationStatus: "UNCONFIRMED",
      locationConfirmedByUserId: null,
      locationConfirmedAt: null,
    });
    await expect(
      prisma.$queryRaw<Array<{ coordinatesCleared: boolean }>>`
        SELECT "coordinates" IS NULL AS "coordinatesCleared"
        FROM "listing_import_candidates"
        WHERE "id" = ${candidateId}::uuid
      `,
    ).resolves.toEqual([{ coordinatesCleared: true }]);
  });

  it("requires a confirmed location and rechecks recent session authorization transactionally", async () => {
    const fixture = nextFixture("Location Authorization");
    const candidateId = await createCandidate(fixture);
    await expect(
      reviews.approveCandidate(actor(), candidateId, { expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: "LOCATION_REQUIRED", status: 422 });

    const confirmed = await confirmCandidate(candidateId);
    await expect(
      reviews.approveCandidate(
        actor(staleAdministratorSessionId),
        candidateId,
        { expectedVersion: confirmed.version },
      ),
    ).rejects.toMatchObject({ code: "ACTOR_NOT_AUTHORIZED", status: 403 });
    await expect(
      prisma.externalListing.count({ where: { candidateId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.listingImportCandidate.findUniqueOrThrow({
        where: { id: candidateId },
        select: { status: true, version: true },
      }),
    ).resolves.toEqual({ status: "PENDING_REVIEW", version: 2 });
  });

  it("blocks approval while a probable duplicate remains unresolved", async () => {
    const fixture = nextFixture("Unresolved Duplicate");
    const event = await createOrganizerEvent(fixture);
    const candidateId = await createCandidate(fixture);
    const confirmed = await confirmCandidate(candidateId);
    await expect(
      prisma.listingDuplicateMatch.findFirstOrThrow({
        where: { candidateId, eventId: event.id },
      }),
    ).resolves.toMatchObject({ resolution: "UNRESOLVED" });

    await expect(
      reviews.approveCandidate(actor(), candidateId, {
        expectedVersion: confirmed.version,
      }),
    ).rejects.toMatchObject({ code: "UNRESOLVED_DUPLICATES", status: 409 });
    await expect(
      prisma.externalListing.count({ where: { candidateId } }),
    ).resolves.toBe(0);
  });

  it("allows approval after an administrator records NOT_DUPLICATE", async () => {
    const fixture = nextFixture("Resolved Duplicate");
    const event = await createOrganizerEvent(fixture);
    const candidateId = await createCandidate(fixture);
    const confirmed = await confirmCandidate(candidateId);
    const match = await prisma.listingDuplicateMatch.findFirstOrThrow({
      where: { candidateId, eventId: event.id },
    });
    const resolved = await reviews.resolveCandidateDuplicate(
      actor(),
      candidateId,
      match.id,
      { expectedVersion: confirmed.version, resolution: "NOT_DUPLICATE" },
    );
    expect(resolved).toMatchObject({
      status: "PENDING_REVIEW",
      resolution: "NOT_DUPLICATE",
      unresolvedDuplicateCount: 0,
    });

    const approved = await reviews.approveCandidate(actor(), candidateId, {
      expectedVersion: resolved.version,
    });
    expect(approved).toMatchObject({
      status: "APPROVED",
      listingVersion: 1,
      unresolvedDuplicateCount: 0,
    });
    await expect(
      prisma.externalListing.count({ where: { candidateId } }),
    ).resolves.toBe(1);
  });

  it("links to a valid published Event without creating an ExternalListing", async () => {
    const fixture = nextFixture("Published Organizer Duplicate");
    const eventId = await createPublishedOrganizerEvent(fixture);
    const candidateId = await createCandidate(fixture);
    const confirmed = await confirmCandidate(candidateId);
    const match = await prisma.listingDuplicateMatch.findFirstOrThrow({
      where: { candidateId, eventId },
    });
    const linked = await reviews.resolveCandidateDuplicate(
      actor(),
      candidateId,
      match.id,
      { expectedVersion: confirmed.version, resolution: "LINKED" },
    );

    expect(linked).toMatchObject({
      status: "DUPLICATE_LINKED",
      resolution: "LINKED",
      unresolvedDuplicateCount: 0,
    });
    await expect(
      prisma.externalListing.count({ where: { candidateId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.listingSourceRecord.findFirstOrThrow({
        where: { candidate: { id: candidateId } },
        select: { linkedEventId: true, linkedExternalListingId: true },
      }),
    ).resolves.toEqual({
      linkedEventId: eventId,
      linkedExternalListingId: null,
    });
  });

  it("approves into a separate ExternalListing and location without touching organizer/payment tables", async () => {
    const fixture = nextFixture("Independent Approval");
    const approved = await createApprovedExternalListing(fixture);
    const listing = await prisma.externalListing.findUniqueOrThrow({
      where: { id: approved.listingId },
      include: { location: true },
    });

    expect(listing).toMatchObject({
      candidateId: approved.candidateId,
      status: "PUBLISHED",
      version: 1,
      title: fixture.content.title,
      location: {
        confirmationStatus: "CONFIRMED",
        resolutionSource: "ADMIN_GEOCODING",
        addressLine1: fixture.content.addressLine1,
      },
    });
    await expect(
      Promise.all([
        prisma.event.count({ where: { publicId: approved.publicId } }),
        prisma.paymentAttempt.count({
          where: { event: { publicId: approved.publicId } },
        }),
        prisma.eventPublication.count({
          where: {
            OR: [
              { publicId: approved.publicId },
              { canonicalPath: approved.canonicalPath },
            ],
          },
        }),
      ]),
    ).resolves.toEqual([0, 0, 0]);
    await expect(
      prisma.listingSourceRecord.findFirstOrThrow({
        where: { candidate: { id: approved.candidateId } },
        select: {
          linkedEventId: true,
          linkedExternalListingId: true,
          externalListing: { select: { id: true } },
        },
      }),
    ).resolves.toEqual({
      linkedEventId: null,
      linkedExternalListingId: null,
      externalListing: { id: approved.listingId },
    });
  });

  it("retries Event-reserved public IDs and fails closed after bounded exhaustion", async () => {
    const reservedPublicId = publicId();
    await createOrganizerEvent(
      nextFixture("Reserved Public Identifier"),
      reservedPublicId,
    );

    const retryFixture = nextFixture("Public Identifier Retry");
    const retryCandidateId = await createCandidate(retryFixture);
    const retryConfirmed = await confirmCandidate(retryCandidateId);
    const secondPublicId = publicId();
    const retryFactory = vi
      .fn<() => string>()
      .mockReturnValueOnce(reservedPublicId)
      .mockReturnValue(secondPublicId);
    const retryReviews = new ListingImportReviewService(
      new PrismaListingImportReviewRepository(prisma, retryFactory),
      new FixtureLocationProvider(),
    );
    const approved = await retryReviews.approveCandidate(
      actor(),
      retryCandidateId,
      { expectedVersion: retryConfirmed.version },
    );
    expect(approved).toMatchObject({
      publicId: secondPublicId,
      status: "APPROVED",
    });
    expect(retryFactory).toHaveBeenCalledTimes(2);

    const exhaustedFixture = nextFixture("Public Identifier Exhaustion");
    const exhaustedCandidateId = await createCandidate(exhaustedFixture);
    const exhaustedConfirmed = await confirmCandidate(exhaustedCandidateId);
    const exhaustedFactory = vi.fn<() => string>(() => reservedPublicId);
    const exhaustedReviews = new ListingImportReviewService(
      new PrismaListingImportReviewRepository(prisma, exhaustedFactory),
      new FixtureLocationProvider(),
    );
    await expect(
      exhaustedReviews.approveCandidate(actor(), exhaustedCandidateId, {
        expectedVersion: exhaustedConfirmed.version,
      }),
    ).rejects.toMatchObject({
      code: "PUBLIC_ID_ALLOCATION_FAILED",
      status: 503,
    });
    expect(exhaustedFactory).toHaveBeenCalledTimes(8);
    await expect(
      prisma.listingImportCandidate.findUniqueOrThrow({
        where: { id: exhaustedCandidateId },
        select: { status: true, version: true, externalListing: true },
      }),
    ).resolves.toEqual({
      status: "PENDING_REVIEW",
      version: exhaustedConfirmed.version,
      externalListing: null,
    });
  });

  it("keeps rejected and deleted candidates terminal", async () => {
    const rejectedFixture = nextFixture("Terminal Rejection");
    const rejectedId = await createCandidate(rejectedFixture);
    const rejected = await reviews.rejectCandidate(actor(), rejectedId, {
      expectedVersion: 1,
      reason: "The source information is not suitable for publication.",
    });
    expect(rejected).toMatchObject({ status: "REJECTED", version: 2 });
    await expect(
      reviews.editCandidate(
        actor(),
        rejectedId,
        candidateEditInput(rejectedFixture, 2),
      ),
    ).rejects.toMatchObject({ code: "INVALID_LIFECYCLE", status: 409 });

    const deletedFixture = nextFixture("Terminal Deletion");
    const deletedId = await createCandidate(deletedFixture);
    const deleted = await reviews.deleteCandidate(actor(), deletedId, {
      expectedVersion: 1,
      reason: "The retained review candidate was deleted by an administrator.",
      confirmation: "DELETE",
    });
    expect(deleted).toMatchObject({ status: "DELETED", version: 2 });
    await expect(
      reviews.approveCandidate(actor(), deletedId, { expectedVersion: 2 }),
    ).rejects.toMatchObject({ code: "INVALID_LIFECYCLE", status: 409 });
    await expect(
      prisma.externalListing.count({
        where: { candidateId: { in: [rejectedId, deletedId] } },
      }),
    ).resolves.toBe(0);
  });

  it("edits and removes a published ExternalListing with terminal idempotency", async () => {
    const fixture = nextFixture("External Lifecycle");
    const approved = await createApprovedExternalListing(fixture);
    const updatedTitle = `${fixture.content.title} Revised`;
    const edited = await reviews.editExternalListing(
      actor(),
      approved.listingId,
      externalEditInput(fixture, approved.listingVersion, updatedTitle),
    );
    expect(edited).toMatchObject({
      status: "PUBLISHED",
      version: 2,
      previousCanonicalPath: approved.canonicalPath,
    });
    expect(edited.canonicalPath).not.toBe(edited.previousCanonicalPath);

    const removed = await reviews.removeExternalListing(
      actor(),
      approved.listingId,
      {
        expectedVersion: edited.version,
        reason: "The external source listing is no longer available.",
        confirmation: "REMOVE",
      },
    );
    expect(removed).toMatchObject({
      status: "REMOVED",
      version: 3,
      idempotent: false,
    });
    await expect(
      reviews.removeExternalListing(actor(), approved.listingId, {
        expectedVersion: edited.version,
        reason: "A repeated removal remains idempotent.",
        confirmation: "REMOVE",
      }),
    ).resolves.toMatchObject({
      status: "REMOVED",
      version: 3,
      idempotent: true,
    });
    await expect(
      reviews.editExternalListing(
        actor(),
        approved.listingId,
        externalEditInput(fixture, 3, `${updatedTitle} Again`),
      ),
    ).rejects.toMatchObject({ code: "INVALID_LIFECYCLE", status: 409 });
    await expect(
      prisma.auditEntry.count({
        where: {
          targetType: "EXTERNAL_LISTING",
          targetId: approved.listingId,
          action: "EXTERNAL_LISTING_REMOVED",
        },
      }),
    ).resolves.toBe(1);
  });
});
