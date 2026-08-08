import { describe, expect, it, vi } from "vitest";

import { findPrismaDuplicateTargets } from "@/modules/listing-imports/infrastructure/prisma-duplicate-matcher";

type MatcherTransaction = Parameters<typeof findPrismaDuplicateTargets>[0];

const candidate = {
  candidateId: "10000000-0000-4000-8000-000000000001",
  normalizedTitle: "bakersfield estate sale furniture",
  normalizedAddress: "123 main street bakersfield ca 93301 us",
  normalizedPostalCode: "93301",
  startsAt: new Date("2026-08-08T16:00:00.000Z"),
  endsAt: new Date("2026-08-08T22:00:00.000Z"),
  confirmedPoint: { latitude: 35.3733, longitude: -119.0187 },
};

describe("Prisma listing duplicate matcher", () => {
  it("skips all persistence queries for an empty candidate set", async () => {
    const queryRaw = vi.fn();
    const result = await findPrismaDuplicateTargets(
      { $queryRaw: queryRaw } as unknown as MatcherTransaction,
      [],
    );
    expect(result.size).toBe(0);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("maps organizer and external targets through the same exact rules", async () => {
    const eventId = "20000000-0000-4000-8000-000000000001";
    const externalId = "30000000-0000-4000-8000-000000000001";
    const common = {
      candidate_id: candidate.candidateId,
      title: "Bakersfield Estate Sale Furniture",
      starts_at: candidate.startsAt,
      ends_at: candidate.endsAt,
      normalized_address: candidate.normalizedAddress,
      postal_code: candidate.normalizedPostalCode,
      latitude: 35.3733,
      longitude: -119.0187,
      confirmation_status: "CONFIRMED",
    };
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([{ ...common, id: eventId }])
      .mockResolvedValueOnce([
        {
          ...common,
          id: externalId,
          title: "Unrelated moving sale",
          normalized_address: "900 other road bakersfield ca 93308 us",
          postal_code: "93308",
          latitude: 36,
          longitude: -120,
        },
      ]);

    const result = await findPrismaDuplicateTargets(
      { $queryRaw: queryRaw } as unknown as MatcherTransaction,
      [candidate],
    );

    expect(result.get(candidate.candidateId)).toEqual([
      {
        targetKind: "EVENT",
        targetId: eventId,
        reasons: [
          "FULL_ADDRESS_SCHEDULE_OVERLAP",
          "TITLE_POSTAL_DATE_SIMILARITY",
          "CONFIRMED_LOCATION_SCHEDULE_OVERLAP",
        ],
      },
    ]);
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it("rejects an unbounded target comparison set", async () => {
    const rows = Array.from({ length: 20_001 }, (_, index) => ({
      candidate_id: candidate.candidateId,
      id: `event-${String(index)}`,
      title: "Unrelated listing",
      starts_at: candidate.startsAt,
      ends_at: candidate.endsAt,
      normalized_address: "",
      postal_code: "",
      latitude: null,
      longitude: null,
      confirmation_status: "UNCONFIRMED",
    }));
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce([]);

    await expect(
      findPrismaDuplicateTargets(
        { $queryRaw: queryRaw } as unknown as MatcherTransaction,
        [candidate],
      ),
    ).rejects.toMatchObject({ code: "IMPORT_CONFLICT" });
  });
});
