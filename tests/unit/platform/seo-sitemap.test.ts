import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  eventPublication: { count: vi.fn(), findMany: vi.fn() },
  externalListing: { count: vi.fn(), findMany: vi.fn() },
}));
vi.mock("@/platform/database/client", () => ({
  getPrismaClient: () => database,
}));
vi.mock("@/platform/config/application-url", () => ({
  getServerApplicationUrl: () => new URL("https://sales.example.test"),
}));

import { createPublicationSnapshot } from "@/modules/payments/application/publication";
import {
  externalSitemapEntry,
  organizerSitemapEntry,
  sitemapEntries,
  sitemapShards,
} from "@/app/_components/sitemap-data";
import { GET as indexRoute } from "@/app/sitemap.xml/route";
import { GET as shardRoute } from "@/app/sitemaps/[shard]/route";
import robots from "@/app/robots";

import { readyEvent } from "../events/fixtures";

const now = new Date("2026-07-21T12:00:00Z");
const external = {
  publicId: "abc123def456",
  slug: "reviewed-sale",
  canonicalPath: "/estate-sales/reviewed-sale-abc123def456",
  eventType: "ESTATE_SALE" as const,
  startsAt: new Date("2026-07-25T16:00:00Z"),
  endsAt: new Date("2026-07-25T22:00:00Z"),
  timezone: "America/Los_Angeles",
  updatedAt: now,
  attribution: {
    schema: "external-listing-attribution.v1",
    sourceId: "source-1",
    sourceKey: "reviewed",
    sourceListingId: "sale-1",
    sourceName: "Reviewed source",
    sourceUrl: "https://source.example.test/sale-1",
  },
  primarySourceRecord: {
    sourceListingId: "sale-1",
    source: { id: "source-1", key: "reviewed" },
  },
};
function launchEnvironment() {
  for (const [key, value] of Object.entries({
    PUBLIC_INDEXING_ENABLED: "true",
    PUBLIC_IMPORTED_INDEXING_ENABLED: "true",
    APP_ENV: "production",
    PRODUCTION_BETA_MODE: "false",
    STRIPE_MODE: "live",
  }))
    vi.stubEnv(key, value);
}
beforeEach(() => {
  vi.clearAllMocks();
  database.eventPublication.count.mockResolvedValue(0);
  database.externalListing.count.mockResolvedValue(0);
  database.eventPublication.findMany.mockResolvedValue([]);
  database.externalListing.findMany.mockResolvedValue([]);
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("launch sitemap routes", () => {
  it("keeps every sitemap hidden and unadvertised during beta without reading the database", async () => {
    launchEnvironment();
    vi.stubEnv("PRODUCTION_BETA_MODE", "true");
    vi.stubEnv("STRIPE_MODE", "test");
    expect((await indexRoute()).status).toBe(404);
    expect(
      (
        await shardRoute(
          new Request("https://sales.example.test/sitemaps/pages.xml"),
          { params: Promise.resolve({ shard: "pages.xml" }) },
        )
      ).status,
    ).toBe(404);
    expect(robots()).not.toHaveProperty("sitemap");
    expect(database.eventPublication.count).not.toHaveBeenCalled();
    expect(database.externalListing.findMany).not.toHaveBeenCalled();
  });

  it("advertises a canonical index and bounded shards only after launch", async () => {
    launchEnvironment();
    database.eventPublication.count.mockResolvedValue(1001);
    database.externalListing.count.mockResolvedValue(1);
    const response = await indexRoute();
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(
      "https://sales.example.test/sitemaps/organizer-1.xml",
    );
    expect(robots()).toHaveProperty(
      "sitemap",
      "https://sales.example.test/sitemap.xml",
    );
    expect(await sitemapShards(now)).toEqual([
      "pages",
      "organizer-0",
      "organizer-1",
      "external-0",
    ]);
  });

  it("omits utility routes and private data from static and listing XML", async () => {
    launchEnvironment();
    const pages = await shardRoute(
      new Request("https://sales.example.test/sitemaps/pages.xml"),
      { params: Promise.resolve({ shard: "pages.xml" }) },
    );
    const xml = await pages.text();
    expect(xml).toContain("/estate-sales/this-weekend");
    expect(xml).toContain("/sales-today");
    expect(xml).not.toMatch(/\/search|\/admin|\/dashboard|\/signup/);
    database.externalListing.findMany.mockResolvedValue([external]);
    database.externalListing.count.mockResolvedValue(1);
    const response = await shardRoute(
      new Request("https://sales.example.test/sitemaps/external-0.xml"),
      { params: Promise.resolve({ shard: "external-0.xml" }) },
    );
    const listingXml = await response.text();
    expect(listingXml).toContain(external.canonicalPath);
    expect(listingXml).not.toContain("source.example.test");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("filters removal, expiry, unconfirmed locations and linked imports at the query boundary", async () => {
    launchEnvironment();
    database.externalListing.count.mockResolvedValue(1);
    database.eventPublication.count.mockResolvedValue(1);
    await sitemapEntries("external-0", now);
    await sitemapEntries("organizer-0", now);
    expect(database.externalListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 1000,
        where: expect.objectContaining({
          status: "PUBLISHED",
          removedAt: null,
          endsAt: { gt: now },
          location: { confirmationStatus: "CONFIRMED" },
          primarySourceRecord: { linkedEventId: null },
        }),
      }),
    );
    expect(database.eventPublication.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          searchDocument: { endsAt: { gt: now } },
          event: expect.objectContaining({
            canceledAt: null,
            removedAt: null,
            deletedAt: null,
            organizer: { user: { status: "ACTIVE" } },
          }),
        },
      }),
    );
  });

  it("rejects forged external canonical paths, attribution, invalid timezones and expired content", () => {
    expect(externalSitemapEntry(external, now)?.path).toBe(
      external.canonicalPath,
    );
    expect(
      externalSitemapEntry(
        { ...external, canonicalPath: "https://evil.test" },
        now,
      ),
    ).toBeNull();
    expect(
      externalSitemapEntry({ ...external, attribution: {} }, now),
    ).toBeNull();
    expect(
      externalSitemapEntry({ ...external, timezone: "invalid" }, now),
    ).toBeNull();
    expect(externalSitemapEntry({ ...external, endsAt: now }, now)).toBeNull();
  });

  it("validates organizer snapshots and never serializes their hidden addresses", () => {
    const event = readyEvent({ privacyMode: "HIDDEN_UNTIL_START" });
    const snapshot = createPublicationSnapshot(event);
    const row = {
      snapshot,
      canonicalPath: snapshot.projection.path,
      publicId: event.publicId,
      publishedAt: now,
    };
    expect(organizerSitemapEntry(row, now)).toEqual({
      path: row.canonicalPath,
      lastModified: now,
    });
    expect(
      organizerSitemapEntry(
        { ...row, canonicalPath: "/estate-sales/wrong-abc123def456" },
        now,
      ),
    ).toBeNull();
    expect(organizerSitemapEntry({ ...row, snapshot: {} }, now)).toBeNull();
    expect(
      organizerSitemapEntry(row, new Date("2026-08-01T00:00:00Z")),
    ).toBeNull();
  });

  it("returns 503 on data failure and 404 for invalid shard identifiers", async () => {
    launchEnvironment();
    database.eventPublication.count.mockRejectedValue(new Error("offline"));
    expect((await indexRoute()).status).toBe(503);
    expect(await sitemapEntries("external--1", now)).toBeNull();
    expect(await sitemapEntries("external-1-extra", now)).toBeNull();
  });

  it("rejects out-of-range shard offsets before querying listing rows", async () => {
    launchEnvironment();
    database.externalListing.count.mockResolvedValue(1);
    expect(await sitemapEntries("external-99999", now)).toBeNull();
    expect(database.externalListing.findMany).not.toHaveBeenCalled();
  });

  it("keeps imported detail pages out of sitemaps until separately approved", async () => {
    launchEnvironment();
    vi.stubEnv("PUBLIC_IMPORTED_INDEXING_ENABLED", "false");
    database.externalListing.count.mockResolvedValue(50);
    expect(await sitemapShards(now)).toEqual(["pages"]);
    expect(await sitemapEntries("external-0", now)).toBeNull();
    expect(database.externalListing.count).not.toHaveBeenCalled();
    expect(database.externalListing.findMany).not.toHaveBeenCalled();
  });
});
