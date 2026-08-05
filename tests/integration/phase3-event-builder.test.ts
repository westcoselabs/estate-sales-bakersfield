import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthPrincipal } from "@/modules/auth/domain/types";
import { EmailVerificationRequiredError } from "@/modules/auth/domain/errors";
import {
  EventConflictError,
  EventNotFoundError,
  EventValidationError,
} from "@/modules/events/domain/errors";
import { EventService } from "@/modules/events/application/event-service";
import { PUBLISHING_TERMS_VERSION } from "@/modules/events/application/policy";
import { PrismaEventRepository } from "@/modules/events/infrastructure/prisma-event-repository";
import type {
  AddressSuggestion,
  LocationInput,
  ValidatedLocation,
} from "@/modules/locations/domain/types";
import type { LocationProvider } from "@/modules/locations/application/location-provider";
import type { AddressAutocompleteProvider } from "@/modules/locations/application/address-autocomplete-provider";
import { parseMediaObjectKey } from "@/modules/media/domain/object-key";
import { SharpImageProcessor } from "@/modules/media/infrastructure/sharp-image-processor";
import { PrismaOrganizerProfileRepository } from "@/modules/organizers/infrastructure/prisma-organizer-profile-repository";

import { InMemoryMediaStore } from "../contract/blob/in-memory-media-store";
import { createIntegrationClient } from "./support/database";
import { testEmail } from "./support/test-run";

const prisma = createIntegrationClient();
const repository = new PrismaEventRepository(prisma);
const organizerRepository = new PrismaOrganizerProfileRepository(prisma);
const media = new InMemoryMediaStore();

class FixtureLocationProvider
  implements LocationProvider, AddressAutocompleteProvider
{
  validate(input: LocationInput): Promise<ValidatedLocation> {
    return Promise.resolve({
      ...input,
      normalizedAddress: `${input.addressLine1}, ${input.city}, ${input.region} ${input.postalCode}`,
      latitude: 35.373292,
      longitude: -119.018712,
      providerPlaceId: "integration-bakersfield-1",
      providerName: "integration-fixture",
      precision: "exact",
      confidence: 1,
      validationStatus: "VERIFIED",
    });
  }

  autocomplete(): Promise<readonly AddressSuggestion[]> {
    return Promise.resolve([
      {
        id: "integration-bakersfield-1",
        formattedAddress:
          "123 Main Street, Bakersfield, CA 93301, United States",
        houseNumber: "123",
        street: "Main Street",
        city: "Bakersfield",
        state: "CA",
        postalCode: "93301",
        country: "United States",
        countryCode: "US",
        latitude: 35.373292,
        longitude: -119.018712,
        confidence: 1,
        matchType: "full_match",
        provider: {
          name: "test-fixture",
          version: "v1",
          attribution: "Deterministic integration fixture",
        },
      },
    ]);
  }
}

const locationProvider = new FixtureLocationProvider();
const service = new EventService(
  repository,
  locationProvider,
  media,
  new SharpImageProcessor(),
  "test",
);

let owner: AuthPrincipal;
let other: AuthPrincipal;

async function createPrincipal(label: string): Promise<AuthPrincipal> {
  const user = await prisma.user.create({
    data: {
      displayName: `${label} User`,
      email: testEmail(`phase3-${label}`),
      normalizedEmail: testEmail(`phase3-${label}`),
      passwordHash: "integration-test-password-hash",
      emailVerifiedAt: new Date(),
      organizerProfile: {
        create: {
          displayName: `${label} Sales`,
          contactName: `${label} Contact`,
          contactEmail: testEmail(`phase3-${label}-contact`),
          status: "COMPLETE",
        },
      },
    },
  });
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt,
    role: user.role,
    status: user.status,
  };
}

beforeAll(async () => {
  owner = await createPrincipal("owner");
  other = await createPrincipal("other");
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Phase 3 event builder in an isolated Development Neon schema", () => {
  it("creates the internal profile automatically for an account with no profile", async () => {
    const email = testEmail("phase3-no-profile");
    const user = await prisma.user.create({
      data: {
        displayName: "No Profile User",
        email,
        normalizedEmail: email,
        passwordHash: "integration-test-password-hash",
      },
    });
    const principal: AuthPrincipal = {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      emailVerifiedAt: null,
      role: user.role,
      status: user.status,
    };

    const created = await service.create(principal, "ESTATE_SALE");

    expect(created.eventType).toBe("ESTATE_SALE");
    await expect(
      prisma.organizerProfile.findUnique({
        where: { userId: user.id },
        select: { status: true, displayName: true },
      }),
    ).resolves.toEqual({ status: "INCOMPLETE", displayName: null });
    await expect(service.list(principal)).resolves.toEqual([
      expect.objectContaining({ id: created.id }),
    ]);
  });

  it("records Phase 3 and PostgreSQL rate limits as forward-only migrations", async () => {
    const migrations = await prisma.$queryRaw<
      Array<{ migration_name: string }>
    >`
      SELECT "migration_name"
      FROM "_prisma_migrations"
      WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
      ORDER BY "started_at"
    `;
    expect(migrations.map((migration) => migration.migration_name)).toEqual(
      expect.arrayContaining([
        "20260716000000_phase1_foundation",
        "20260717000000_phase2_auth_and_organizers",
        "20260721000000_phase3_event_builder",
        "20260722000000_postgresql_auth_rate_limits",
        "20260724143000_geoapify_confirmed_locations",
      ]),
    );
    expect(
      migrations.findIndex(
        (migration) =>
          migration.migration_name ===
          "20260717000000_phase2_auth_and_organizers",
      ),
    ).toBeLessThan(
      migrations.findIndex(
        (migration) =>
          migration.migration_name === "20260721000000_phase3_event_builder",
      ),
    );
    expect(
      migrations.findIndex(
        (migration) =>
          migration.migration_name === "20260721000000_phase3_event_builder",
      ),
    ).toBeLessThan(
      migrations.findIndex(
        (migration) =>
          migration.migration_name ===
          "20260722000000_postgresql_auth_rate_limits",
      ),
    );
    expect(
      migrations.findIndex(
        (migration) =>
          migration.migration_name ===
          "20260722000000_postgresql_auth_rate_limits",
      ),
    ).toBeLessThan(
      migrations.findIndex(
        (migration) =>
          migration.migration_name ===
          "20260724143000_geoapify_confirmed_locations",
      ),
    );
  });

  it("keeps truthfully marked legacy Mapbox rows readable", async () => {
    const event = await service.create(owner, "ESTATE_SALE");
    await prisma.$executeRaw`
      INSERT INTO "event_locations" (
        "event_id", "address_line_1", "city", "region", "postal_code",
        "country_code", "normalized_address", "latitude", "longitude",
        "coordinates", "timezone", "provider_place_id", "provider_name",
        "provider_version", "provider_attribution", "resolution_source",
        "confirmation_status", "confirmed_at", "public_zone", "precision",
        "confidence", "validation_status"
      ) VALUES (
        ${event.id}::uuid, '123 Legacy Street', 'Bakersfield', 'CA', '93301',
        'US', '123 Legacy Street, Bakersfield, CA 93301, US', 35.373292,
        -119.018712,
        ST_SetSRID(ST_MakePoint(-119.018712, 35.373292), 4326)::geography,
        'America/Los_Angeles', 'legacy-mapbox-id', 'mapbox',
        'geocoding-v6', 'Legacy Mapbox geocoding result', 'LEGACY_PROVIDER',
        'CONFIRMED', CURRENT_TIMESTAMP, 'bakersfield', 'exact', 1,
        'VERIFIED'
      )
    `;

    await expect(
      repository.findOwned(event.id, owner.id),
    ).resolves.toMatchObject({
      location: {
        providerName: "mapbox",
        providerPlaceId: "legacy-mapbox-id",
        providerVersion: "geocoding-v6",
        resolutionSource: "LEGACY_PROVIDER",
        confirmationStatus: "CONFIRMED",
        latitude: 35.373292,
        longitude: -119.018712,
      },
    });
  });

  it("creates, resumes, validates, previews, approves, and invalidates a private draft", async () => {
    let event = await service.create(owner, "ESTATE_SALE", {
      requestId: "phase3-create",
    });
    expect(event.workflowState).toBe("INCOMPLETE_DRAFT");
    expect((await service.list(owner)).map((item) => item.id)).toContain(
      event.id,
    );

    event = await service.updateDetails(
      owner,
      event.id,
      {
        expectedVersion: event.version,
        title: "Westchester Estate Sale",
        description:
          "A carefully organized estate sale with furniture, artwork, and collectible household pieces.",
      },
      { requestId: "phase3-details" },
    );
    event = await service.updateSchedule(owner, event.id, {
      expectedVersion: event.version,
      localStartsAt: "2026-08-08T09:00",
      localEndsAt: "2026-08-08T15:00",
      timezone: "America/Los_Angeles",
    });
    const [selectedLocation] = await locationProvider.autocomplete();
    if (!selectedLocation) throw new Error("Missing location fixture");
    const lowConfidenceLocation = {
      ...selectedLocation,
      confidence: 0.32,
      matchType: "provider-specific-street-result",
    };
    event = await service.updateLocation(owner, event.id, {
      expectedVersion: event.version,
      addressLine1: "123 Main Street",
      addressLine2: null,
      city: "Bakersfield",
      region: "CA",
      postalCode: "93301",
      countryCode: "US",
      timezone: "America/Los_Angeles",
      privacyMode: "APPROXIMATE_LOCATION",
      confirmed: true,
      selectedLocation: lowConfidenceLocation,
    });
    expect(event.location).toMatchObject({
      confirmationStatus: "CONFIRMED",
      validationStatus: "VERIFIED",
      precision: "provider-specific-street-result",
    });
    const coordinates = await prisma.$queryRaw<
      Array<{ longitude: number; latitude: number }>
    >`
      SELECT ST_X("coordinates"::geometry) AS "longitude",
             ST_Y("coordinates"::geometry) AS "latitude"
      FROM "event_locations"
      WHERE "event_id" = ${event.id}::uuid
    `;
    expect(Number(coordinates[0]?.longitude)).toBeCloseTo(-119.018712, 5);
    expect(Number(coordinates[0]?.latitude)).toBeCloseTo(35.373292, 5);

    event = await service.updateLocation(owner, event.id, {
      expectedVersion: event.version,
      addressLine1: "125 Main Street",
      addressLine2: null,
      city: "Bakersfield",
      region: "CA",
      postalCode: "93301",
      countryCode: "US",
      timezone: "America/Los_Angeles",
      privacyMode: "APPROXIMATE_LOCATION",
      confirmed: false,
    });
    expect(event.location).toMatchObject({
      addressLine1: "125 Main Street",
      confirmationStatus: "UNCONFIRMED",
      validationStatus: "UNVALIDATED",
      latitude: null,
      longitude: null,
    });
    await expect(service.preview(owner, event.id)).rejects.toThrow(
      /incomplete/,
    );

    event = await service.updateLocation(owner, event.id, {
      expectedVersion: event.version,
      addressLine1: "123 Main Street",
      addressLine2: null,
      city: "Bakersfield",
      region: "CA",
      postalCode: "93301",
      countryCode: "US",
      timezone: "America/Los_Angeles",
      privacyMode: "APPROXIMATE_LOCATION",
      confirmed: true,
      selectedLocation: lowConfidenceLocation,
    });

    const unverifiedOwner = { ...owner, emailVerifiedAt: null };
    const reservation = await service.reservePhoto(unverifiedOwner, event.id, {
      expectedVersion: event.version,
      contentType: "image/jpeg",
    });
    event = reservation.event;
    const objectKey = parseMediaObjectKey(reservation.uploadPathname);
    await expect(
      service.authorizePhotoUpload(unverifiedOwner, event.id, {
        expectedVersion: event.version,
        reservationId: reservation.reservationId,
        photoId: reservation.photoId,
        pathname: reservation.uploadPathname,
      }),
    ).resolves.toMatchObject({ contentType: "image/jpeg" });
    await expect(
      service.authorizePhotoUpload(unverifiedOwner, event.id, {
        expectedVersion: event.version,
        reservationId: reservation.reservationId,
        photoId: reservation.photoId,
        pathname: `${reservation.uploadPathname}-different`,
      }),
    ).rejects.toThrow("invalid or expired");
    const source = await sharp({
      create: {
        width: 1000,
        height: 700,
        channels: 3,
        background: "#80664a",
      },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    await media.putPrivate(objectKey, source, "image/jpeg");
    await expect(
      service.finalizePhoto(unverifiedOwner, event.id, reservation.photoId, {
        expectedVersion: event.version,
        reservationId: reservation.reservationId,
        pathname: `${reservation.uploadPathname}-different`,
      }),
    ).rejects.toThrow("invalid or expired");
    event = await service.finalizePhoto(
      unverifiedOwner,
      event.id,
      reservation.photoId,
      {
        expectedVersion: event.version,
        reservationId: reservation.reservationId,
        pathname: reservation.uploadPathname,
      },
      { requestId: "phase3-photo" },
    );
    expect(event.photos[0]?.status).toBe("READY");
    expect(await media.inspect(objectKey)).toBeNull();

    const secondReservation = await service.reservePhoto(owner, event.id, {
      expectedVersion: event.version,
      contentType: "image/jpeg",
    });
    event = secondReservation.event;
    const secondObjectKey = parseMediaObjectKey(
      secondReservation.uploadPathname,
    );
    await media.putPrivate(secondObjectKey, source, "image/jpeg");
    event = await service.finalizePhoto(
      unverifiedOwner,
      event.id,
      secondReservation.photoId,
      {
        expectedVersion: event.version,
        reservationId: secondReservation.reservationId,
        pathname: secondReservation.uploadPathname,
      },
      { requestId: "phase3-photo-second" },
    );
    expect(
      event.photos.filter((photo) => photo.status === "READY"),
    ).toHaveLength(2);

    const failedReservation = await service.reservePhoto(owner, event.id, {
      expectedVersion: event.version,
      contentType: "image/jpeg",
    });
    event = failedReservation.event;
    const failedObjectKey = parseMediaObjectKey(
      failedReservation.uploadPathname,
    );
    await media.putPrivate(
      failedObjectKey,
      new Uint8Array([1, 2, 3]),
      "image/jpeg",
    );
    await expect(
      service.finalizePhoto(owner, event.id, failedReservation.photoId, {
        expectedVersion: event.version,
        reservationId: failedReservation.reservationId,
        pathname: failedReservation.uploadPathname,
      }),
    ).rejects.toThrow("image could not be processed safely");
    event = await service.get(owner, event.id);
    expect(
      event.photos.filter((photo) => photo.status === "READY"),
    ).toHaveLength(2);
    expect(
      event.photos.find((photo) => photo.id === failedReservation.photoId)
        ?.status,
    ).toBe("FAILED");

    event = await service.setCover(
      unverifiedOwner,
      event.id,
      reservation.photoId,
      event.version,
    );
    expect(event.workflowState).toBe("PREVIEW_READY");
    expect(event.readiness.ready).toBe(true);

    const preview = await service.preview(unverifiedOwner, event.id);
    expect(preview.address).toEqual({
      kind: "APPROXIMATE",
      city: "Bakersfield",
      region: "CA",
      countryCode: "US",
      label: "Near Bakersfield, CA",
    });
    expect(JSON.stringify(preview)).not.toContain("123 Main Street");
    expect(JSON.stringify(preview)).not.toContain("35.373292");

    const initialApprovalInput = {
      expectedVersion: event.version,
      acceptedTerms: true as const,
      termsVersion: PUBLISHING_TERMS_VERSION,
    };
    await expect(
      service.approve(unverifiedOwner, event.id, initialApprovalInput),
    ).rejects.toBeInstanceOf(EmailVerificationRequiredError);
    const [approved, concurrentApproval] = await Promise.all([
      service.approve(owner, event.id, initialApprovalInput),
      service.approve(owner, event.id, initialApprovalInput),
    ]);
    event = approved;
    expect(event).toMatchObject({
      workflowState: "APPROVED_FOR_PAYMENT",
      approvalStatus: "APPROVED",
      approvedRevision: event.contentRevision,
      termsVersion: PUBLISHING_TERMS_VERSION,
    });
    expect(event.approvalDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(concurrentApproval).toMatchObject({
      version: event.version,
      contentRevision: event.contentRevision,
      approvedRevision: event.approvedRevision,
      approvalDigest: event.approvalDigest,
      approvalStatus: "APPROVED",
      workflowState: "APPROVED_FOR_PAYMENT",
    });
    expect(
      await prisma.eventApproval.count({
        where: {
          eventId: event.id,
          contentRevision: event.contentRevision,
          acceptedByUserId: owner.id,
        },
      }),
    ).toBe(1);

    const approvedVersion = event.version;
    const approvedAt = event.approvedAt;
    const approvedDigest = event.approvalDigest;
    event = await service.approve(owner, event.id, {
      expectedVersion: event.version,
      acceptedTerms: true,
      termsVersion: PUBLISHING_TERMS_VERSION,
    });
    expect(event).toMatchObject({
      version: approvedVersion,
      approvedAt,
      approvalDigest: approvedDigest,
      approvalStatus: "APPROVED",
      workflowState: "APPROVED_FOR_PAYMENT",
    });
    expect(
      await prisma.eventApproval.count({
        where: {
          eventId: event.id,
          contentRevision: event.contentRevision,
          acceptedByUserId: owner.id,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.auditEntry.count({
        where: {
          targetId: event.id,
          action: "EVENT_REVISION_APPROVED",
        },
      }),
    ).toBe(1);

    const firstApprovalDigest = event.approvalDigest;
    const firstApprovedRevision = event.contentRevision;
    const organizer = await prisma.organizerProfile.findUniqueOrThrow({
      where: { userId: owner.id },
    });
    await organizerRepository.saveForUser({
      userId: owner.id,
      displayName: "Owner Sales Updated",
      contactName: organizer.contactName,
      contactEmail: organizer.contactEmail,
      contactPhone: organizer.contactPhone,
      websiteUrl: "https://updated-organizer.example.test/",
      status: "COMPLETE",
      audit: { requestId: "phase3-organizer-public-change" },
    });
    event = await service.get(owner, event.id);
    expect(event.approvalStatus).toBe("NOT_APPROVED");
    expect(event.approvalDigest).toBeNull();
    expect(event.contentRevision).toBe(firstApprovedRevision + 1);
    event = await service.approve(owner, event.id, {
      expectedVersion: event.version,
      acceptedTerms: true,
      termsVersion: PUBLISHING_TERMS_VERSION,
    });
    expect(event.approvalDigest).not.toBe(firstApprovalDigest);
    expect(event.approvedRevision).toBe(firstApprovedRevision + 1);

    const approvals = await prisma.eventApproval.findMany({
      where: { eventId: event.id },
      orderBy: { contentRevision: "asc" },
      select: {
        contentRevision: true,
        approvalDigest: true,
        approvedAt: true,
        id: true,
      },
    });
    expect(approvals).toHaveLength(2);
    expect(approvals.map((approval) => approval.contentRevision)).toEqual([
      firstApprovedRevision,
      firstApprovedRevision + 1,
    ]);
    expect(approvals[0]?.approvalDigest).not.toBe(approvals[1]?.approvalDigest);
    const currentApproval = await prisma.eventApproval.findUnique({
      where: {
        eventId_contentRevision: {
          eventId: event.id,
          contentRevision: event.approvedRevision!,
        },
      },
      select: { contentRevision: true, approvalDigest: true },
    });
    expect(currentApproval).toMatchObject({
      contentRevision: event.approvedRevision,
      approvalDigest: event.approvalDigest,
    });

    const approvedRevision = event.contentRevision;
    event = await service.updateDetails(owner, event.id, {
      expectedVersion: event.version,
      title: "Westchester Estate Sale — Updated",
      description: event.description!,
    });
    expect(event.approvalStatus).toBe("NOT_APPROVED");
    expect(event.approvedRevision).toBeNull();
    expect(event.approvalDigest).toBeNull();
    expect(event.contentRevision).toBe(approvedRevision + 1);
    expect(
      await prisma.eventApproval.count({ where: { eventId: event.id } }),
    ).toBe(2);

    const auditActions = await prisma.auditEntry.findMany({
      where: { targetType: "EVENT", targetId: event.id },
      select: { action: true, metadata: true },
    });
    expect(auditActions.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        "EVENT_DRAFT_CREATED",
        "EVENT_LOCATION_UPDATED",
        "EVENT_PHOTO_READY",
        "EVENT_REVISION_APPROVED",
        "EVENT_APPROVAL_INVALIDATED",
      ]),
    );
    expect(JSON.stringify(auditActions)).not.toContain("123 Main Street");
  }, 60_000);

  it("enforces optimistic concurrency and organizer ownership below the route layer", async () => {
    const created = await service.create(owner, "YARD_SALE");
    const attempts = await Promise.allSettled([
      service.updateDetails(owner, created.id, {
        expectedVersion: created.version,
        title: "First tab title",
        description:
          "A valid description entered from the first active browser tab.",
      }),
      service.updateDetails(owner, created.id, {
        expectedVersion: created.version,
        title: "Second tab title",
        description:
          "A valid description entered from the second active browser tab.",
      }),
    ]);
    expect(
      attempts.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejection = attempts.find((result) => result.status === "rejected");
    expect(rejection).toMatchObject({
      status: "rejected",
      reason: expect.any(EventConflictError),
    });
    await expect(service.get(other, created.id)).rejects.toBeInstanceOf(
      EventNotFoundError,
    );
  });

  it("soft-deletes only a confirmed abandoned draft and queues media purge", async () => {
    const created = await service.create(owner, "ESTATE_SALE");
    const titled = await service.updateDetails(owner, created.id, {
      expectedVersion: created.version,
      title: "Confirmed deletion fixture",
      description:
        "A sufficiently detailed draft description used to verify safe deletion.",
    });

    await expect(
      service.deleteDraft(owner, titled.id, {
        expectedVersion: titled.version,
        confirmation: "confirmed deletion fixture",
      }),
    ).rejects.toBeInstanceOf(EventValidationError);
    await expect(
      service.deleteDraft(other, titled.id, {
        expectedVersion: titled.version,
        confirmation: titled.title!,
      }),
    ).rejects.toBeInstanceOf(EventNotFoundError);
    await expect(
      service.deleteDraft(
        owner,
        titled.id,
        {
          expectedVersion: titled.version,
          confirmation: titled.title!,
        },
        { requestId: "phase3-safe-draft-delete" },
      ),
    ).resolves.toEqual({ deleted: true });

    await expect(service.get(owner, titled.id)).rejects.toBeInstanceOf(
      EventNotFoundError,
    );
    expect(await service.list(owner)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: titled.id })]),
    );
    await expect(
      prisma.event.findUnique({
        where: { id: titled.id },
        select: { deletedAt: true, canceledAt: true, removedAt: true },
      }),
    ).resolves.toMatchObject({
      deletedAt: expect.any(Date),
      canceledAt: null,
      removedAt: null,
    });
    await expect(
      prisma.auditEntry.findFirst({
        where: {
          targetId: titled.id,
          action: "EVENT_DRAFT_DELETED",
        },
        select: { requestId: true },
      }),
    ).resolves.toEqual({ requestId: "phase3-safe-draft-delete" });
    await expect(
      prisma.durableJob.findUnique({
        where: {
          queue_type_deduplicationKey: {
            queue: "default",
            type: "EVENT_MEDIA_PURGE",
            deduplicationKey: `event-media-purge:${titled.id}`,
          },
        },
        select: { status: true, payload: true, runAt: true },
      }),
    ).resolves.toMatchObject({
      status: "PENDING",
      payload: { eventId: titled.id },
      runAt: expect.any(Date),
    });

    const untitled = await service.create(owner, "YARD_SALE");
    await expect(
      service.deleteDraft(owner, untitled.id, {
        expectedVersion: untitled.version,
        confirmation: "Delete",
      }),
    ).resolves.toEqual({ deleted: true });
  });

  it("database constraints reject duplicate public IDs and cross-event covers", async () => {
    const first = await service.create(owner, "ESTATE_SALE");
    const second = await service.create(owner, "YARD_SALE");
    const organizer = await prisma.organizerProfile.findUniqueOrThrow({
      where: { userId: owner.id },
    });
    await expect(
      prisma.event.create({
        data: {
          organizerId: organizer.id,
          eventType: "YARD_SALE",
          publicId: first.publicId,
          slug: "duplicate",
        },
      }),
    ).rejects.toThrow();

    const readyPhoto = await prisma.eventPhoto.create({
      data: {
        eventId: second.id,
        status: "READY",
        sortOrder: 0,
        dashboardThumbnailKey: `test/event-${second.id}/fixture/thumb.webp`,
        listingCardKey: `test/event-${second.id}/fixture/card.webp`,
        galleryKey: `test/event-${second.id}/fixture/gallery.webp`,
        coverDisplayKey: `test/event-${second.id}/fixture/cover.webp`,
        dashboardThumbnailHash: "a".repeat(64),
        listingCardHash: "b".repeat(64),
        galleryHash: "c".repeat(64),
        coverDisplayHash: "d".repeat(64),
        width: 800,
        height: 600,
        sourceContentType: "image/jpeg",
        sourceSize: 100,
        readyAt: new Date(),
      },
    });
    await expect(
      prisma.event.update({
        where: { id: first.id },
        data: { coverPhoto: { connect: { id: readyPhoto.id } } },
      }),
    ).rejects.toThrow();
  });
});
