import { describe, expect, it, vi } from "vitest";

import {
  CachedPublicSearchService,
  canCachePublicSearch,
  publicSearchValidUntil,
  type CachedPublicSearchPage,
} from "@/modules/public-search/application/cached-public-search-service";
import { normalizeSearchQuery } from "@/modules/public-search/application/criteria";
import type {
  PublicListingCardProjection,
  PublicSearchPage,
} from "@/modules/public-search/domain/types";

const criteria = normalizeSearchQuery({ view: "list" }).criteria;
function page(
  items: readonly PublicListingCardProjection[] = [],
): PublicSearchPage {
  return {
    schema: "public-search-v1",
    criteria,
    items,
    markers: [],
    pageInfo: { hasNext: false, nextCursor: null },
  };
}
function listing(
  startsAt: string,
  endsAt: string,
): PublicListingCardProjection {
  return {
    id: "abc123def456",
    sourceKind: "EXTERNAL",
    resultKey: "external:abc123def456",
    sourceLabel: "Original source",
    unclaimed: true,
    href: "/estate-sales/sale-abc123def456",
    saleType: "estate",
    title: "Reviewed sale",
    startsAt,
    endsAt,
    localStartsAt: "2026-07-25T09:00",
    localEndsAt: "2026-07-25T15:00",
    timezone: "America/Los_Angeles",
    location: {
      kind: "hidden",
      label: "Bakersfield area",
      city: "Bakersfield",
      region: "CA",
    },
    coverPhotoUrl: "/images/marketplace-hero.webp",
  };
}
function harness(initial: string) {
  let time = new Date(initial);
  const store = new Map<string, CachedPublicSearchPage>();
  const fresh = { search: vi.fn().mockResolvedValue(page()) };
  const cache = {
    readRevision: vi.fn().mockResolvedValue("1"),
    readPage: vi.fn(
      async (key: string, load: () => Promise<CachedPublicSearchPage>) => {
        const hit = store.get(key);
        if (hit) return hit;
        const loaded = await load();
        store.set(key, loaded);
        return loaded;
      },
    ),
  };
  const service = new CachedPublicSearchService(fresh, cache, () => time);
  return {
    service,
    fresh,
    cache,
    store,
    advance: (value: string) => {
      time = new Date(value);
    },
  };
}

describe("bounded public search cache", () => {
  it("reuses public first-page results while checking the authoritative revision on every call", async () => {
    const h = harness("2026-07-25T15:00:00Z");
    await h.service.search(criteria);
    await h.service.search(criteria);
    expect(h.fresh.search).toHaveBeenCalledOnce();
    expect(h.cache.readRevision).toHaveBeenCalledTimes(2);
    expect([...h.store.values()][0]).toMatchObject({ result: { markers: [] } });
    expect(JSON.stringify([...h.store.values()])).not.toMatch(
      /snapshot|latitude|longitude|addressLine1/,
    );
  });

  it("makes removed or newly published inventory visible immediately after a committed revision change", async () => {
    const h = harness("2026-07-25T15:00:00Z");
    h.fresh.search
      .mockResolvedValueOnce(
        page([listing("2026-07-25T16:00:00Z", "2026-07-25T22:00:00Z")]),
      )
      .mockResolvedValueOnce(page());
    expect((await h.service.search(criteria)).items).toHaveLength(1);
    h.cache.readRevision.mockResolvedValue("2");
    expect((await h.service.search(criteria)).items).toHaveLength(0);
    expect(h.fresh.search).toHaveBeenCalledTimes(2);
  });

  it("bypasses a still-cached value at an address release within the same 30-second slot", async () => {
    const h = harness("2026-07-25T15:59:30Z");
    const hidden = listing("2026-07-25T15:59:40Z", "2026-07-25T22:00:00Z");
    h.fresh.search.mockResolvedValueOnce(page([hidden])).mockResolvedValueOnce(
      page([
        {
          ...hidden,
          location: {
            ...hidden.location,
            kind: "exact",
            label: "Public sale address",
          },
        },
      ]),
    );
    expect((await h.service.search(criteria)).items[0]?.location.kind).toBe(
      "hidden",
    );
    h.advance("2026-07-25T15:59:41Z");
    expect((await h.service.search(criteria)).items[0]?.location.kind).toBe(
      "exact",
    );
    expect(h.fresh.search).toHaveBeenCalledTimes(2);
  });

  it("does not serve an expired sale even if the cache backend returns a stale entry", async () => {
    const h = harness("2026-07-25T21:59:30Z");
    h.fresh.search
      .mockResolvedValueOnce(
        page([listing("2026-07-25T16:00:00Z", "2026-07-25T21:59:40Z")]),
      )
      .mockResolvedValueOnce(page());
    await h.service.search(criteria);
    h.advance("2026-07-25T21:59:41Z");
    expect((await h.service.search(criteria)).items).toHaveLength(0);
  });

  it("expires at the selected address reveal even when the sale starts hours later", async () => {
    const h = harness("2026-07-25T12:59:30Z");
    const item = listing("2026-07-25T16:00:00Z", "2026-07-25T22:00:00Z");
    const hidden = {
      ...item,
      location: { ...item.location, releasesAt: "2026-07-25T12:59:40Z" },
    };
    h.fresh.search
      .mockResolvedValueOnce(page([hidden]))
      .mockResolvedValueOnce(
        page([{ ...item, location: { ...item.location, kind: "exact" } }]),
      );
    expect((await h.service.search(criteria)).items[0]?.location.kind).toBe(
      "hidden",
    );
    h.advance("2026-07-25T12:59:40Z");
    expect((await h.service.search(criteria)).items[0]?.location.kind).toBe(
      "exact",
    );
    expect(h.fresh.search).toHaveBeenCalledTimes(2);
  });

  it("changes cache keys every 30 seconds and separates result limits and sale/date presets", async () => {
    const h = harness("2026-07-25T15:00:00Z");
    await h.service.search(criteria);
    await h.service.search(criteria, undefined, 3);
    await h.service.search({ ...criteria, sale: "yard" });
    await h.service.search({ ...criteria, date: "weekend" });
    h.advance("2026-07-25T15:00:30Z");
    await h.service.search(criteria);
    expect(h.store.size).toBe(5);
  });

  it("expires empty results at Bakersfield midnight including the DST boundary", () => {
    const beforeMidnight = new Date("2026-11-01T06:59:50Z");
    expect(publicSearchValidUntil(page(), beforeMidnight)).toBe(
      new Date("2026-11-01T07:00:00Z").getTime(),
    );
  });

  it("never caches map, bounds, cursor, custom date or noncanonical criteria", async () => {
    const h = harness("2026-07-25T15:00:00Z");
    for (const changes of [
      { view: "map" as const },
      { cursor: "abcdefgh" },
      { date: "custom" as const, from: "2026-07-25", to: "2026-07-26" },
      { bounds: { west: -119.4, south: 35.1, east: -119.0, north: 35.5 } },
      { from: "2026-07-25" },
    ]) {
      const input = { ...criteria, ...changes };
      expect(canCachePublicSearch(input)).toBe(false);
      await h.service.search(input);
    }
    expect(h.fresh.search).toHaveBeenCalledTimes(5);
    expect(h.cache.readRevision).not.toHaveBeenCalled();
  });

  it("fails closed if the revision cannot be read instead of returning prior cached listings", async () => {
    const h = harness("2026-07-25T15:00:00Z");
    await h.service.search(criteria);
    h.cache.readRevision.mockRejectedValue(new Error("database offline"));
    await expect(h.service.search(criteria)).rejects.toThrow(
      "database offline",
    );
    expect(h.cache.readPage).toHaveBeenCalledOnce();
  });
});
