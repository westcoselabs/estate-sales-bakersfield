import { describe, expect, it } from "vitest";

import {
  classifyListingIdentity,
  distanceInMetres,
  jaccardSimilarity,
  probableDuplicateReasons,
  schedulesOverlap,
  titleTokens,
  type ListingDuplicateComparable,
} from "@/modules/listing-imports";

const startsAt = new Date("2026-08-08T16:00:00.000Z");
const endsAt = new Date("2026-08-08T22:00:00.000Z");

function comparable(
  overrides: Partial<ListingDuplicateComparable> = {},
): ListingDuplicateComparable {
  return {
    normalizedTitle: "large bakersfield estate sale furniture",
    normalizedAddress: "123 main street bakersfield ca 93301 us",
    normalizedPostalCode: "93301",
    startsAt,
    endsAt,
    confirmedPoint: { latitude: 35.3733, longitude: -119.0187 },
    ...overrides,
  };
}

describe("listing import duplicate rules", () => {
  it("uses half-open schedule overlap semantics", () => {
    expect(schedulesOverlap(comparable(), comparable())).toBe(true);
    expect(
      schedulesOverlap(
        comparable(),
        comparable({
          startsAt: endsAt,
          endsAt: new Date("2026-08-09T01:00:00.000Z"),
        }),
      ),
    ).toBe(false);
  });

  it("calculates title-token Jaccard similarity", () => {
    expect(
      jaccardSimilarity(
        titleTokens("large bakersfield estate sale furniture"),
        titleTokens("large bakersfield estate sale"),
      ),
    ).toBe(0.8);
  });

  it("emits deterministic reasons for each probable-match rule", () => {
    const target = comparable({
      normalizedTitle: "large bakersfield estate sale",
      startsAt: new Date(startsAt.getTime() + 24 * 60 * 60 * 1000),
      endsAt: new Date(endsAt.getTime() + 24 * 60 * 60 * 1000),
      confirmedPoint: { latitude: 35.3733, longitude: -119.0167 },
    });
    const reasons = probableDuplicateReasons(comparable(), target);
    expect(reasons).toEqual(["TITLE_POSTAL_DATE_SIMILARITY"]);

    const overlappingTarget = comparable({
      normalizedTitle: "large bakersfield estate sale",
      confirmedPoint: { latitude: 35.3733, longitude: -119.0167 },
    });
    expect(probableDuplicateReasons(comparable(), overlappingTarget)).toEqual([
      "FULL_ADDRESS_SCHEDULE_OVERLAP",
      "TITLE_POSTAL_DATE_SIMILARITY",
      "CONFIRMED_LOCATION_SCHEDULE_OVERLAP",
    ]);
    expect(
      distanceInMetres(
        comparable().confirmedPoint!,
        overlappingTarget.confirmedPoint!,
      ),
    ).toBeLessThanOrEqual(250);
  });

  it("does not use a missing full address or unconfirmed point", () => {
    expect(
      probableDuplicateReasons(
        comparable({ normalizedAddress: "", confirmedPoint: null }),
        comparable({ normalizedAddress: "", confirmedPoint: null }),
      ),
    ).toEqual(["TITLE_POSTAL_DATE_SIMILARITY"]);
  });

  it("classifies exact source identity outcomes deterministically", () => {
    const incoming = {
      sourceListingId: "source-1",
      canonicalSourceUrl: "https://fixture.invalid/source-1",
      contentHash: "hash-a",
    };
    expect(
      classifyListingIdentity({
        incoming,
        bySourceListingId: null,
        byCanonicalSourceUrl: null,
      }),
    ).toBe("CANDIDATE_CREATED");
    expect(
      classifyListingIdentity({
        incoming,
        bySourceListingId: incoming,
        byCanonicalSourceUrl: incoming,
      }),
    ).toBe("EXACT_DUPLICATE");
    expect(
      classifyListingIdentity({
        incoming,
        bySourceListingId: { ...incoming, contentHash: "hash-before" },
        byCanonicalSourceUrl: null,
      }),
    ).toBe("SOURCE_CHANGED");
    expect(
      classifyListingIdentity({
        incoming,
        bySourceListingId: null,
        byCanonicalSourceUrl: {
          ...incoming,
          sourceListingId: "different-source-id",
        },
      }),
    ).toBe("IDENTITY_CONFLICT");
  });
});
