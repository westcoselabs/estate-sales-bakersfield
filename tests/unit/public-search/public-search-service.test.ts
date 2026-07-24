import { describe, expect, it, vi } from "vitest";

import type {
  PublicSearchCursor,
  PublicSearchRepository,
  PublicSearchSourceRecord,
} from "@/modules/public-search/application/ports";
import { PublicSearchService } from "@/modules/public-search/application/public-search-service";
import type { PublicSearchCriteria } from "@/modules/public-search/domain/types";

const now = new Date("2026-07-23T19:00:00.000Z");

function criteria(
  overrides: Partial<PublicSearchCriteria> = {},
): PublicSearchCriteria {
  return {
    sale: "all",
    date: "all",
    from: null,
    to: null,
    location: "bakersfield-ca",
    sort: "soonest",
    view: "list",
    cursor: null,
    ...overrides,
  };
}

function source(input: {
  publicId: string;
  startsAt: string;
  eventType?: "ESTATE_SALE" | "YARD_SALE";
  privacyMode?: "EXACT_ADDRESS" | "APPROXIMATE_LOCATION" | "HIDDEN_UNTIL_START";
  addressKind?: "EXACT" | "APPROXIMATE";
  latitude?: number | null;
  longitude?: number | null;
}): PublicSearchSourceRecord {
  const eventType = input.eventType ?? "ESTATE_SALE";
  const segment = eventType === "ESTATE_SALE" ? "estate-sales" : "yard-sales";
  const path = `/${segment}/fixture-${input.publicId}`;
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(startsAt.getTime() + 6 * 60 * 60 * 1000);
  const address =
    input.addressKind === "APPROXIMATE"
      ? {
          kind: "APPROXIMATE" as const,
          city: "Bakersfield",
          region: "CA",
          countryCode: "US",
          label: "Near Downtown Bakersfield",
        }
      : {
          kind: "EXACT" as const,
          addressLine1: "123 Private Street",
          addressLine2: "Unit 9",
          city: "Bakersfield",
          region: "CA",
          postalCode: "93301",
          countryCode: "US",
        };

  return {
    publicId: input.publicId,
    canonicalPath: path,
    eventType,
    startsAt,
    endsAt,
    location: {
      latitude: input.latitude ?? 35.373292,
      longitude: input.longitude ?? -119.018712,
      confirmationStatus: "CONFIRMED",
      publicZone: "bakersfield",
    },
    snapshot: {
      schema: "estate-sales-publication-v1",
      privacyMode: input.privacyMode ?? "EXACT_ADDRESS",
      projection: {
        title: `Public sale ${input.publicId}`,
        description:
          "Private description content that is not part of a search card.",
        eventType,
        path,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        timezone: "America/Los_Angeles",
        localStartsAt: "2026-08-01T09:00",
        localEndsAt: "2026-08-01T15:00",
        address,
        organizer: {
          displayName: "Private Organizer",
          websiteUrl: "https://private-organizer.example.test/",
        },
        coverPhotoUrl: `/media/photo-${input.publicId}/cover`,
        gallery: [
          {
            id: `gallery-${input.publicId}`,
            url: `/media/photo-${input.publicId}/gallery`,
            position: 0,
          },
        ],
      },
    },
  };
}

class InMemoryPublicSearchRepository implements PublicSearchRepository {
  readonly search = vi.fn(
    async (input: Parameters<PublicSearchRepository["search"]>[0]) => {
      const rows = this.rows
        .filter((row) => !input.eventType || row.eventType === input.eventType)
        .filter((row) => row.endsAt > input.activeAfter)
        .filter(
          (row) =>
            !input.range ||
            (row.startsAt < input.range.endsAt &&
              row.endsAt > input.range.startsAt),
        )
        .sort(
          (left, right) =>
            left.startsAt.getTime() - right.startsAt.getTime() ||
            left.publicId.localeCompare(right.publicId),
        )
        .filter((row) => isAfterCursor(row, input.cursor));
      return rows.slice(0, input.limit);
    },
  );

  constructor(private readonly rows: readonly PublicSearchSourceRecord[]) {}
}

function isAfterCursor(
  row: PublicSearchSourceRecord,
  cursor: PublicSearchCursor | null,
): boolean {
  if (!cursor) return true;
  const difference = row.startsAt.getTime() - cursor.startsAt.getTime();
  return difference > 0 || (difference === 0 && row.publicId > cursor.publicId);
}

describe("PublicSearchService", () => {
  it("pages a stable soonest-first order using startsAt and publicId", async () => {
    const rows = [
      source({
        publicId: "000000000003",
        startsAt: "2026-08-02T16:00:00.000Z",
      }),
      source({
        publicId: "000000000002",
        startsAt: "2026-08-01T16:00:00.000Z",
      }),
      source({
        publicId: "000000000001",
        startsAt: "2026-08-01T16:00:00.000Z",
      }),
    ];
    const repository = new InMemoryPublicSearchRepository(rows);
    const service = new PublicSearchService(repository);

    const first = await service.search(criteria(), now, 2);
    expect(first.items.map((item) => item.id)).toEqual([
      "000000000001",
      "000000000002",
    ]);
    expect(first.pageInfo).toMatchObject({
      hasNext: true,
      nextCursor: expect.any(String),
    });
    expect(repository.search).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ cursor: null, limit: 3 }),
    );

    const second = await service.search(
      criteria({ cursor: first.pageInfo.nextCursor }),
      now,
      2,
    );
    expect(second.items.map((item) => item.id)).toEqual(["000000000003"]);
    expect(second.pageInfo).toEqual({ hasNext: false, nextCursor: null });
    expect(repository.search).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        cursor: {
          startsAt: new Date("2026-08-01T16:00:00.000Z"),
          publicId: "000000000002",
        },
        limit: 3,
      }),
    );
  });

  it("passes supported sale, location, active, and date criteria to the source", async () => {
    const repository = new InMemoryPublicSearchRepository([]);
    const service = new PublicSearchService(repository);

    await service.search(
      criteria({
        sale: "yard",
        date: "custom",
        from: "2026-08-01",
        to: "2026-08-03",
      }),
      now,
      500,
    );

    expect(repository.search).toHaveBeenCalledWith({
      eventType: "YARD_SALE",
      location: { city: "Bakersfield", region: "CA" },
      activeAfter: now,
      range: {
        startsAt: new Date("2026-08-01T07:00:00.000Z"),
        endsAt: new Date("2026-08-04T07:00:00.000Z"),
      },
      cursor: null,
      bounds: null,
      limit: 25,
    });
  });

  it("returns a narrow card contract and never leaks exact address or organizer data", async () => {
    const repository = new InMemoryPublicSearchRepository([
      source({
        publicId: "abc123def456",
        startsAt: "2026-08-01T16:00:00.000Z",
      }),
    ]);
    const page = await new PublicSearchService(repository).search(
      criteria(),
      now,
    );

    expect(page.items[0]).toEqual({
      id: "abc123def456",
      href: "/estate-sales/fixture-abc123def456",
      saleType: "estate",
      title: "Public sale abc123def456",
      startsAt: "2026-08-01T16:00:00.000Z",
      endsAt: "2026-08-01T22:00:00.000Z",
      localStartsAt: "2026-08-01T09:00",
      localEndsAt: "2026-08-01T15:00",
      timezone: "America/Los_Angeles",
      location: {
        kind: "exact",
        label: "Bakersfield, CA",
        city: "Bakersfield",
        region: "CA",
      },
      coverPhotoUrl: "/media/photo-abc123def456/cover",
    });

    const serialized = JSON.stringify(page);
    for (const privateValue of [
      "123 Private Street",
      "Unit 9",
      "93301",
      "Private Organizer",
      "private-organizer.example.test",
      "Private description",
      "gallery-abc123def456",
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it("applies hidden-until-start privacy at request time", async () => {
    const repository = new InMemoryPublicSearchRepository([
      source({
        publicId: "fed654cba321",
        startsAt: "2026-08-01T16:00:00.000Z",
        privacyMode: "HIDDEN_UNTIL_START",
      }),
    ]);

    const beforeStart = await new PublicSearchService(repository).search(
      criteria(),
      now,
    );
    expect(beforeStart.items[0]?.location).toEqual({
      kind: "hidden",
      label: "Bakersfield, CA",
      city: "Bakersfield",
      region: "CA",
    });
    expect(JSON.stringify(beforeStart)).not.toContain("123 Private Street");
  });

  it("preserves only an approved approximate label", async () => {
    const repository = new InMemoryPublicSearchRepository([
      source({
        publicId: "123abc456def",
        startsAt: "2026-08-01T16:00:00.000Z",
        privacyMode: "APPROXIMATE_LOCATION",
        addressKind: "APPROXIMATE",
      }),
    ]);

    const page = await new PublicSearchService(repository).search(
      criteria(),
      now,
    );
    expect(page.items[0]?.location).toEqual({
      kind: "approximate",
      label: "Near Downtown Bakersfield",
      city: "Bakersfield",
      region: "CA",
    });
  });

  it("returns marker IDs matching the loaded cards and protects non-exact geometry", async () => {
    const repository = new InMemoryPublicSearchRepository([
      source({
        publicId: "111111111111",
        startsAt: "2026-08-01T16:00:00.000Z",
        latitude: 35.22,
        longitude: -118.82,
      }),
      source({
        publicId: "222222222222",
        startsAt: "2026-08-01T17:00:00.000Z",
        privacyMode: "APPROXIMATE_LOCATION",
        addressKind: "APPROXIMATE",
        latitude: 35.21,
        longitude: -118.66666,
      }),
      source({
        publicId: "333333333333",
        startsAt: "2026-08-01T18:00:00.000Z",
        privacyMode: "HIDDEN_UNTIL_START",
        latitude: 35.2,
        longitude: -118.77777,
      }),
    ]);

    const mapPage = await new PublicSearchService(repository).search(
      criteria({ view: "map" }),
      now,
    );
    expect(mapPage.items.map(({ id }) => id)).toEqual(
      mapPage.markers?.map(({ id }) => id),
    );
    expect(mapPage.markers?.[0]).toMatchObject({
      id: "111111111111",
      markerKind: "exact",
      geometry: { coordinates: [-118.82, 35.22] },
    });
    expect(mapPage.markers?.[1]).toMatchObject({
      id: "222222222222",
      markerKind: "approximate",
      locationLabel: "Bakersfield area",
      geometry: { coordinates: [-119.018712, 35.373292] },
    });
    expect(mapPage.markers?.[2]).toMatchObject({
      id: "333333333333",
      markerKind: "hidden",
      locationLabel: "Bakersfield area",
      geometry: { coordinates: [-119.018712, 35.373292] },
    });
    const serialized = JSON.stringify(mapPage);
    expect(serialized).not.toContain("-118.66666");
    expect(serialized).not.toContain("-118.77777");

    const listPage = await new PublicSearchService(repository).search(
      criteria(),
      now,
    );
    expect(listPage).not.toHaveProperty("markers");
  });

  it("rejects a snapshot whose path or type disagrees with publication authority", async () => {
    const row = source({
      publicId: "123456abcdef",
      startsAt: "2026-08-01T16:00:00.000Z",
    });
    const repository = new InMemoryPublicSearchRepository([
      { ...row, canonicalPath: "/estate-sales/other-123456abcdef" },
    ]);

    await expect(
      new PublicSearchService(repository).search(criteria(), now),
    ).rejects.toThrow(
      "The publication projection does not match its authority",
    );
  });

  it("rejects invalid or criteria-mismatched cursors", async () => {
    const repository = new InMemoryPublicSearchRepository([]);
    const service = new PublicSearchService(repository);

    await expect(
      service.search(criteria({ cursor: "not-a-real-base64-cursor" }), now),
    ).rejects.toThrow("The search cursor does not match the active criteria");
    expect(repository.search).not.toHaveBeenCalled();
  });

  it("allows a cursor to move between list and map views but not filter sets", async () => {
    const repository = new InMemoryPublicSearchRepository([
      source({
        publicId: "000000000001",
        startsAt: "2026-08-01T16:00:00.000Z",
      }),
      source({
        publicId: "000000000002",
        startsAt: "2026-08-02T16:00:00.000Z",
      }),
    ]);
    const service = new PublicSearchService(repository);
    const first = await service.search(criteria(), now, 1);

    await expect(
      service.search(
        criteria({ cursor: first.pageInfo.nextCursor, view: "map" }),
        now,
        1,
      ),
    ).resolves.toMatchObject({ items: [{ id: "000000000002" }] });
    await expect(
      service.search(
        criteria({ cursor: first.pageInfo.nextCursor, sale: "yard" }),
        now,
        1,
      ),
    ).rejects.toThrow("The search cursor does not match the active criteria");
  });
});
