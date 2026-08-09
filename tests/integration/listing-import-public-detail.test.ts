import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadPublishedListing } from "@/app/_components/published-listing-loader";
import { disconnectPrismaForTests } from "@/platform/database/client";

import { createIntegrationClient } from "./support/database";
import {
  createListingImportReviewHarness,
  type ListingImportReviewHarness,
} from "./support/listing-import-review-fixtures";

const prisma = createIntegrationClient();
const PUBLIC_NOW = new Date("2097-01-01T18:00:00.000Z");

let harness: ListingImportReviewHarness;

async function approveExternalListing(label: string, calendarDate: string) {
  const fixture = harness.nextFixture(label, { calendarDate });
  const created = await harness.createCandidate(fixture);
  const confirmed = await harness.confirmCandidate(created.candidateId);
  const approved = await harness.reviews.approveCandidate(
    harness.actor(),
    created.candidateId,
    { expectedVersion: confirmed.version },
    { requestId: harness.identifier("public-detail-approval") },
  );
  const listing = await prisma.externalListing.findUniqueOrThrow({
    where: { id: approved.listingId },
    select: {
      id: true,
      canonicalPath: true,
      primarySourceRecordId: true,
      publicId: true,
      slug: true,
    },
  });
  const segment = listing.canonicalPath.split("/").at(-1);
  if (!segment) throw new Error("Approved listing has no canonical segment.");
  return { ...listing, segment };
}

beforeAll(async () => {
  harness = await createListingImportReviewHarness(prisma, {
    baseCalendarDate: "2098-01-01",
  });
});

afterAll(async () => {
  await Promise.all([prisma.$disconnect(), disconnectPrismaForTests()]);
});

describe("external listing public detail persistence", () => {
  it("loads an approved listing at its canonical route with attribution and no organizer", async () => {
    const listing = await approveExternalListing(
      "Canonical Public Detail",
      "2098-03-10",
    );

    const detail = await loadPublishedListing(
      "ESTATE_SALE",
      listing.segment,
      PUBLIC_NOW,
    );

    expect(detail).toMatchObject({
      sourceKind: "EXTERNAL",
      listingId: listing.id,
      canonicalPath: listing.canonicalPath,
      sourceLabel: expect.any(String),
      sourceUrl: expect.stringMatching(/^https:\/\//u),
      projection: {
        coverPhotoUrl: "/images/marketplace-hero.webp",
        gallery: [],
        address: { kind: "APPROXIMATE" },
      },
    });
    expect(detail?.projection).not.toHaveProperty("organizer");
  });

  it("keeps immutable publication attribution when the observed source URL moves", async () => {
    const listing = await approveExternalListing(
      "Moved Source Public Detail",
      "2098-03-20",
    );
    const before = await loadPublishedListing(
      "ESTATE_SALE",
      listing.segment,
      PUBLIC_NOW,
    );
    expect(before?.sourceKind).toBe("EXTERNAL");
    const snapshottedSourceUrl =
      before?.sourceKind === "EXTERNAL" ? before.sourceUrl : null;

    await prisma.listingSourceRecord.update({
      where: { id: listing.primarySourceRecordId },
      data: {
        canonicalSourceUrl: `https://fixture.invalid/moved/${listing.id}`,
      },
    });

    const after = await loadPublishedListing(
      "ESTATE_SALE",
      listing.segment,
      PUBLIC_NOW,
    );
    expect(after).toMatchObject({
      sourceKind: "EXTERNAL",
      sourceUrl: snapshottedSourceUrl,
    });
  });

  it("resolves an old category URL to the current cross-category canonical path", async () => {
    const listing = await approveExternalListing(
      "Cross Category Public Detail",
      "2098-03-30",
    );
    const canonicalPath = `/yard-sales/${listing.slug}-${listing.publicId}`;
    await prisma.externalListing.update({
      where: { id: listing.id },
      data: {
        eventType: "YARD_SALE",
        canonicalPath,
        version: { increment: 1 },
      },
    });

    await expect(
      loadPublishedListing("ESTATE_SALE", listing.segment, PUBLIC_NOW),
    ).resolves.toMatchObject({
      sourceKind: "EXTERNAL",
      canonicalPath,
      projection: { eventType: "YARD_SALE", path: canonicalPath },
    });
  });

  it.each(["REMOVED", "EXPIRED"] as const)(
    "does not load a lifecycle-inactive %s listing",
    async (status) => {
      const listing = await approveExternalListing(
        `${status} Public Detail`,
        status === "REMOVED" ? "2098-04-10" : "2098-05-10",
      );
      await prisma.externalListing.update({
        where: { id: listing.id },
        data:
          status === "REMOVED"
            ? {
                status,
                removedAt: PUBLIC_NOW,
                removalReason: "Test removal",
                version: { increment: 1 },
              }
            : { status, expiredAt: PUBLIC_NOW, version: { increment: 1 } },
      });

      await expect(
        loadPublishedListing("ESTATE_SALE", listing.segment, PUBLIC_NOW),
      ).resolves.toBeNull();
    },
  );

  it("enforces endsAt at query time even if expiration work is delayed", async () => {
    const listing = await approveExternalListing(
      "Delayed Expiration Public Detail",
      "2098-06-10",
    );
    await prisma.externalListing.update({
      where: { id: listing.id },
      data: {
        startsAt: new Date("2096-12-30T18:00:00.000Z"),
        endsAt: new Date("2096-12-31T18:00:00.000Z"),
        version: { increment: 1 },
      },
    });

    await expect(
      loadPublishedListing("ESTATE_SALE", listing.segment, PUBLIC_NOW),
    ).resolves.toBeNull();
  });
});
