import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PublicSearchModule from "@/modules/public-search";

const search = vi.hoisted(() => vi.fn());
vi.mock("@/modules/public-search", async (importOriginal) => ({
  ...(await importOriginal<typeof PublicSearchModule>()),
  createConfiguredPublicSearchService: () => ({ search }),
}));

import {
  loadSalesHub,
  salesHubCursor,
  salesHubHref,
  salesHubMetadata,
} from "@/app/_components/sales-hub-data";
import { SalesHubListings } from "@/app/_components/sales-hub-listings";
import { PublicSearchCursorError } from "@/modules/public-search";

beforeEach(() => {
  search.mockReset().mockResolvedValue({
    items: [],
    pageInfo: { hasNext: false, nextCursor: null },
  });
  vi.stubEnv("PUBLIC_INDEXING_ENABLED", "false");
});
afterEach(() => vi.unstubAllEnvs());

describe("curated sales hubs", () => {
  it.each([
    ["estate-weekend", "estate", "weekend"],
    ["yard-weekend", "yard", "weekend"],
    ["today", "all", "today"],
    ["estate", "estate", "all"],
    ["yard", "yard", "all"],
  ] as const)(
    "queries %s using bounded server-rendered list results",
    async (key, sale, date) => {
      await loadSalesHub(key, null);
      expect(search).toHaveBeenCalledWith(
        expect.objectContaining({
          sale,
          date,
          view: "list",
          cursor: null,
          location: "bakersfield-ca",
        }),
        expect.any(Date),
        24,
      );
    },
  );

  it("gives pagination its own canonical URL while excluding tracking parameters", async () => {
    search.mockResolvedValue({
      items: [{ resultKey: "external:example" }],
      pageInfo: { hasNext: false, nextCursor: null },
    });
    const cursor = "abcdefgh_1234";
    const metadata = await salesHubMetadata("estate-weekend", {
      cursor,
      utm_source: "newsletter",
    });
    expect(metadata.alternates).toEqual({
      canonical: "/estate-sales/this-weekend?cursor=abcdefgh_1234",
    });
    expect(metadata.robots).toMatchObject({ index: false });
    expect(salesHubHref("today")).toBe("/sales-today");
    expect(salesHubCursor({ utm_source: "newsletter" })).toBeNull();
  });

  it("rejects malformed or mismatched cursors instead of emitting indexable errors", async () => {
    expect(() =>
      salesHubCursor({ cursor: ["abcdefgh", "ijklmnop"] }),
    ).toThrow();
    expect(() => salesHubCursor({ cursor: "<script>" })).toThrow();
    search.mockRejectedValue(new PublicSearchCursorError());
    await expect(
      salesHubMetadata("today", { cursor: "abcdefgh1234" }),
    ).rejects.toThrow();
  });

  it("does not index empty pages beyond the available inventory", async () => {
    await expect(loadSalesHub("estate", "abcdefgh1234")).rejects.toThrow();
  });

  it("renders crawlable pagination and a useful empty state without JavaScript", async () => {
    search.mockResolvedValue({
      items: [],
      pageInfo: { hasNext: true, nextCursor: "abcdefgh1234" },
    });
    const html = renderToStaticMarkup(
      await SalesHubListings({ hubKey: "yard", cursor: null }),
    );
    expect(html).toContain('href="/yard-sales?cursor=abcdefgh1234"');
    expect(html).toContain("No matching sales are currently published");
    expect(html).toContain("Browse all upcoming sales");
    expect(html).not.toContain("maplibre");
  });
});
