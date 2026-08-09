import type * as NextNavigation from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadPublishedListing: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn<(url: string) => void>(),
  permanentRedirect: vi.fn<(url: string) => void>(),
}));

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof NextNavigation>();

  return {
    ...actual,
    notFound: mocks.notFound,
    redirect: (url: string) => {
      mocks.redirect(url);
      return actual.redirect(url);
    },
    permanentRedirect: (url: string) => {
      mocks.permanentRedirect(url);
      return actual.permanentRedirect(url);
    },
  };
});

vi.mock("@/app/_components/published-listing-loader", () => ({
  loadPublishedListing: mocks.loadPublishedListing,
}));

vi.mock("@/app/_components/public-event-listing", () => ({
  PublicListing: () => null,
  publicListingMetadata: () => ({ title: "Public listing" }),
}));

import EstateSaleListingPage, {
  generateMetadata as estateSaleMetadata,
} from "@/app/estate-sales/[listing]/page";
import YardSaleListingPage, {
  generateMetadata as yardSaleMetadata,
} from "@/app/yard-sales/[listing]/page";

beforeEach(() => {
  mocks.loadPublishedListing.mockReset();
  mocks.notFound.mockClear();
  mocks.redirect.mockClear();
  mocks.permanentRedirect.mockClear();
});

describe("public listing detail routes", () => {
  it("marks an expired external estate listing non-indexable and returns not found", async () => {
    mocks.loadPublishedListing.mockResolvedValue(null);
    const params = Promise.resolve({ listing: "expired-abc123def456" });

    await expect(estateSaleMetadata({ params })).resolves.toEqual({
      title: "Estate sale not found",
      robots: { index: false },
    });
    await expect(EstateSaleListingPage({ params })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mocks.notFound).toHaveBeenCalledOnce();
    expect(mocks.loadPublishedListing).toHaveBeenCalledWith(
      "ESTATE_SALE",
      "expired-abc123def456",
    );
  });

  it("marks a removed external yard sale non-indexable and returns not found", async () => {
    mocks.loadPublishedListing.mockResolvedValue(null);
    const params = Promise.resolve({ listing: "removed-abc123def456" });

    await expect(yardSaleMetadata({ params })).resolves.toEqual({
      title: "Yard sale not found",
      robots: { index: false },
    });
    await expect(YardSaleListingPage({ params })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mocks.notFound).toHaveBeenCalledOnce();
    expect(mocks.loadPublishedListing).toHaveBeenCalledWith(
      "YARD_SALE",
      "removed-abc123def456",
    );
  });

  it("keeps an A-to-B-to-A canonical edit cycle on temporary redirects", async () => {
    const estateSegment = "estate-a-abc123def456";
    const estatePath = `/estate-sales/${estateSegment}`;
    const yardSegment = "yard-b-abc123def456";
    const yardPath = `/yard-sales/${yardSegment}`;

    mocks.loadPublishedListing
      .mockResolvedValueOnce({
        canonicalPath: yardPath,
        sourceKind: "EXTERNAL",
      })
      .mockResolvedValueOnce({
        canonicalPath: estatePath,
        sourceKind: "EXTERNAL",
      });

    await expect(
      EstateSaleListingPage({
        params: Promise.resolve({ listing: estateSegment }),
      }),
    ).rejects.toMatchObject({
      digest: expect.stringContaining(`;${yardPath};307;`),
    });
    await expect(
      YardSaleListingPage({
        params: Promise.resolve({ listing: yardSegment }),
      }),
    ).rejects.toMatchObject({
      digest: expect.stringContaining(`;${estatePath};307;`),
    });

    expect(mocks.redirect.mock.calls).toEqual([[yardPath], [estatePath]]);
    expect(mocks.permanentRedirect).not.toHaveBeenCalled();
  });

  it("preserves permanent canonical redirects for organizer publications", async () => {
    const requestedSegment = "old-organizer-slug-abc123def456";
    const canonicalPath = "/estate-sales/current-organizer-slug-abc123def456";
    mocks.loadPublishedListing.mockResolvedValue({
      canonicalPath,
      sourceKind: "ORGANIZER",
    });

    await expect(
      EstateSaleListingPage({
        params: Promise.resolve({ listing: requestedSegment }),
      }),
    ).rejects.toMatchObject({
      digest: expect.stringContaining(`;${canonicalPath};308;`),
    });

    expect(mocks.permanentRedirect).toHaveBeenCalledWith(canonicalPath);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
