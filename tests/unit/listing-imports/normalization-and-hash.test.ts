import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  canonicalizeSourceUrl,
  canonicalListingContent,
  ListingImportRowError,
  listingContentHash,
  normalizeDescription,
  normalizedFullAddress,
  normalizeListingContent,
  normalizeSingleLine,
} from "@/modules/listing-imports";

import { listingItem } from "./fixtures";

describe("listing import normalization and hashing", () => {
  it("canonicalizes an allowed HTTPS URL, path, percent escapes, and query order", () => {
    expect(
      canonicalizeSourceUrl(
        "  https://FIXTURE.invalid./sale//summer/%7eitems/?ref=z&page=2&ref=a  ",
        {
          allowedHosts: ["fixture.invalid"],
          allowedQueryParameters: ["page", "ref"],
        },
      ),
    ).toBe("https://fixture.invalid/sale/summer/~items?page=2&ref=a&ref=z");
  });

  it.each([
    ["http://fixture.invalid/sale", "SOURCE_URL_INVALID"],
    ["https://user@fixture.invalid/sale", "SOURCE_URL_INVALID"],
    ["https://fixture.invalid/sale#details", "SOURCE_URL_INVALID"],
    ["https://other.invalid/sale", "SOURCE_HOST_NOT_ALLOWED"],
    [
      "https://fixture.invalid/sale?tracking=1",
      "SOURCE_QUERY_PARAMETER_NOT_ALLOWED",
    ],
  ] as const)("rejects disallowed URL %s with %s", (url, code) => {
    expect(() =>
      canonicalizeSourceUrl(url, {
        allowedHosts: ["fixture.invalid"],
        allowedQueryParameters: [],
      }),
    ).toThrowError(expect.objectContaining({ code }));
  });

  it("rejects a URL whose canonical encoding exceeds the contract limit", () => {
    expect(() =>
      canonicalizeSourceUrl(
        `https://fixture.invalid/sale?q=${"é".repeat(900)}`,
        {
          allowedHosts: ["fixture.invalid"],
          allowedQueryParameters: ["q"],
        },
      ),
    ).toThrowError(expect.objectContaining({ code: "SOURCE_URL_INVALID" }));
  });

  it("normalizes display text without losing intentional description paragraphs", () => {
    expect(normalizeSingleLine("  Caf\u00e9\t Estate   Sale ")).toBe(
      "Caf\u00e9 Estate Sale",
    );
    expect(
      normalizeDescription(" First\tline.  \r\n\r\n\r\n Second   line. \r\n"),
    ).toBe("First line.\n\nSecond line.");
  });

  it("uses the existing local schedule conversion and rejects inverted ranges", () => {
    const normalized = normalizeListingContent(listingItem());
    expect(normalized.startsAt.toISOString()).toBe("2026-08-08T16:00:00.000Z");
    expect(normalized.endsAt.toISOString()).toBe("2026-08-08T22:00:00.000Z");

    expect(() =>
      normalizeListingContent(
        listingItem({
          localStartsAt: "2026-08-08T15:00",
          localEndsAt: "2026-08-08T09:00",
        }),
      ),
    ).toThrow();
  });

  it("does not call a city-only projection a normalized full address", () => {
    expect(
      normalizedFullAddress({
        addressLine1: null,
        addressLine2: null,
        city: "Bakersfield",
        region: "CA",
        postalCode: "93301",
        countryCode: "US",
      }),
    ).toBe("");
  });

  it("hashes exactly the ordered thirteen normalized content fields", () => {
    const item = normalizeListingContent(
      listingItem({ addressLine1: null, addressLine2: null }),
    );
    const canonical = canonicalListingContent(item);
    expect(Object.keys(canonical)).toEqual([
      "eventType",
      "title",
      "description",
      "localStartsAt",
      "localEndsAt",
      "timezone",
      "addressLine1",
      "addressLine2",
      "city",
      "region",
      "postalCode",
      "countryCode",
      "privacyMode",
    ]);
    expect(canonical.addressLine1).toBeNull();
    expect(canonical.addressLine2).toBeNull();
    expect(listingContentHash(item)).toBe(
      createHash("sha256")
        .update(JSON.stringify(canonical), "utf8")
        .digest("hex"),
    );

    const withProvenance = {
      ...item,
      sourceListingId: "ignored-source-id",
      sourceUrl: "https://ignored.invalid/listing",
      retrievedAt: "2026-08-04T12:00:00.000Z",
    };
    expect(listingContentHash(withProvenance)).toBe(listingContentHash(item));
  });

  it("exposes URL failures as bounded row errors", () => {
    try {
      canonicalizeSourceUrl("not-a-url", {
        allowedHosts: ["fixture.invalid"],
        allowedQueryParameters: [],
      });
      throw new Error("expected canonicalization to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ListingImportRowError);
      expect(error).toMatchObject({ code: "SOURCE_URL_INVALID" });
    }
  });
});
