import { describe, expect, it } from "vitest";

import {
  decodeAdminCursor,
  encodeAdminCursor,
  listingDirectoryCriteria,
  userDirectoryCriteria,
} from "@/modules/admin/application/criteria";

describe("admin directory criteria", () => {
  it("round-trips only timestamp and UUID cursor fields", () => {
    const cursor = {
      at: new Date("2026-07-30T12:00:00.000Z"),
      id: "11111111-1111-4111-8111-111111111111",
    };
    expect(decodeAdminCursor(encodeAdminCursor(cursor))).toEqual(cursor);
    expect(decodeAdminCursor("invalid")).toBeNull();
  });

  it("bounds page size and rejects unknown filters", () => {
    expect(
      userDirectoryCriteria({ limit: "500", filter: "nope" }),
    ).toMatchObject({
      limit: 50,
      filter: "all",
    });
    expect(
      listingDirectoryCriteria({ limit: "-2", filter: "removed" }),
    ).toMatchObject({ limit: 1, filter: "removed" });
  });
});
