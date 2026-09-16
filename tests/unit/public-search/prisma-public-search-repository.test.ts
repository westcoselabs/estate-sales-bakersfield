import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import { PrismaPublicSearchRepository } from "@/modules/public-search/infrastructure/prisma-public-search-repository";

vi.mock("server-only", () => ({}));

async function renderedSearchSql(): Promise<string> {
  const queryRaw = vi.fn().mockResolvedValue([]);
  const repository = new PrismaPublicSearchRepository({
    $queryRaw: queryRaw,
  } as unknown as PrismaClient);

  await repository.search({
    eventType: null,
    location: { city: "Bakersfield", region: "CA" },
    activeAfter: new Date("2026-08-08T19:00:00.000Z"),
    range: null,
    cursor: null,
    limit: 21,
    bounds: { west: -119.3, south: 35.5, east: -119.2, north: 35.6 },
  });

  const query = queryRaw.mock.calls[0]?.[0] as { readonly sql?: unknown };
  expect(query.sql).toEqual(expect.any(String));
  return query.sql as string;
}

describe("PrismaPublicSearchRepository", () => {
  it("keeps organizer search authority independent of mutable payment state", async () => {
    const sql = await renderedSearchSql();
    expect(sql).toContain('FROM "event_publications" AS publication');
    expect(sql).toContain('INNER JOIN "events" AS source_event');
    expect(sql).not.toContain("payment_attempts");
    expect(sql).not.toContain("payment_state");
  });

  it("releases organizer and external hidden-listing bounds at the query clock", async () => {
    const sql = await renderedSearchSql();
    const [organizerBranch, externalBranch] = sql.split("UNION ALL");

    expect(organizerBranch).toContain(
      `search_document."privacy_mode" = 'HIDDEN_UNTIL_START'`,
    );
    expect(organizerBranch).toContain(
      `COALESCE(source_event."published_snapshot", publication."snapshot") ->> 'addressRevealAt'`,
    );
    expect(organizerBranch).toContain(`search_document."starts_at") <=`);
    expect(externalBranch).toContain(
      `listing."privacy_mode" = 'HIDDEN_UNTIL_START'`,
    );
    expect(externalBranch).toContain('listing."starts_at" <=');
  });

  it("filters protected results by the same fixed neighborhood cell as public map markers", async () => {
    const sql = await renderedSearchSql();
    expect(sql).toContain('FLOOR(location."longitude" *');
    expect(sql).toContain('FLOOR(location."latitude" *');
    expect(sql).toContain("NOT");
    expect(sql).toContain("location.\"public_zone\" = 'bakersfield'");
  });
});
