import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthPrincipal } from "@/modules/auth/domain/types";
import {
  EventConflictError,
  EventNotFoundError,
} from "@/modules/events/domain/errors";
import { EventService } from "@/modules/events/application/event-service";
import { PUBLISHING_TERMS_VERSION } from "@/modules/events/application/policy";
import { PrismaEventRepository } from "@/modules/events/infrastructure/prisma-event-repository";
import type {
  LocationInput,
  ValidatedLocation,
} from "@/modules/locations/domain/types";
import type { LocationProvider } from "@/modules/locations/application/location-provider";
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

class FixtureLocationProvider implements LocationProvider {
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
}

const service = new EventService(
  repository,
  new FixtureLocationProvider(),
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

describe("Phase 3 event builder against isolated Test Neon", () => {
  it("records the forward-only Phase 3 migration after the Phase 2 migration", async () => {
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

    const reservation = await service.reservePhoto(owner, event.id, {
      expectedVersion: event.version,
      contentType: "image/jpeg",
    });
    event = reservation.event;
    const objectKey = parseMediaObjectKey(
      decodeURIComponent(new URL(reservation.uploadUrl).pathname.slice(1)),
    );
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
    event = await service.finalizePhoto(
      owner,
      event.id,
      reservation.photoId,
      {
        expectedVersion: event.version,
        reservationId: reservation.reservationId,
      },
      { requestId: "phase3-photo" },
    );
    expect(event.photos[0]?.status).toBe("READY");
    expect(await media.inspect(objectKey)).toBeNull();
    event = await service.setCover(
      owner,
      event.id,
      reservation.photoId,
      event.version,
    );
    expect(event.workflowState).toBe("PREVIEW_READY");
    expect(event.readiness.ready).toBe(true);

    const preview = await service.preview(owner, event.id);
    expect(preview.address).toEqual({
      kind: "APPROXIMATE",
      city: "Bakersfield",
      region: "CA",
      countryCode: "US",
      label: "Near Bakersfield, CA",
    });
    expect(JSON.stringify(preview)).not.toContain("123 Main Street");
    expect(JSON.stringify(preview)).not.toContain("35.373292");

    event = await service.approve(owner, event.id, {
      expectedVersion: event.version,
      acceptedTerms: true,
      termsVersion: PUBLISHING_TERMS_VERSION,
    });
    expect(event).toMatchObject({
      workflowState: "APPROVED_FOR_PAYMENT",
      approvalStatus: "APPROVED",
      approvedRevision: event.contentRevision,
      termsVersion: PUBLISHING_TERMS_VERSION,
    });
    expect(event.approvalDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(
      await prisma.eventApproval.count({
        where: {
          eventId: event.id,
          contentRevision: event.contentRevision,
          acceptedByUserId: owner.id,
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
    ).toBe(1);

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
