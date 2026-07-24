import type { Metadata } from "next";
import { headers } from "next/headers";

import { PublicShell } from "@/components/shells/shells";
import { SearchControls } from "@/features/search/search-controls";
import { SearchResults } from "@/features/search/search-results";
import {
  createConfiguredPublicSearchService,
  enforcePublicSearchRateLimit,
  normalizeSearchQuery,
  type PublicSearchRawQuery,
  type PublicSearchPage,
} from "@/modules/public-search";
import { searchRobots } from "@/platform/seo/indexing-policy";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Find Estate Sales and Yard Sales in Bakersfield",
  description:
    "Browse upcoming published estate-sale and yard-sale listings in Bakersfield by sale type and date.",
  alternates: { canonical: "/search" },
  robots: searchRobots,
  openGraph: {
    title: "Find Estate Sales and Yard Sales in Bakersfield",
    description:
      "Browse upcoming local estate sales and yard sales in one shared search experience.",
    url: "/search",
    images: [
      {
        url: "/images/marketplace-hero.webp",
        width: 1774,
        height: 887,
        alt: "A warm Bakersfield home interior with vintage furniture",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Find Sales in Bakersfield",
    description: "Browse upcoming estate sales and yard sales in Bakersfield.",
    images: ["/images/marketplace-hero.webp"],
  },
};

export default async function SearchPage({
  searchParams,
}: {
  readonly searchParams: Promise<PublicSearchRawQuery>;
}) {
  const normalized = normalizeSearchQuery(await searchParams);
  let result: PublicSearchPage | null = null;
  if (!normalized.issue) {
    try {
      await enforcePublicSearchRateLimit(
        await headers(),
        normalized.criteria.view,
      );
      result = await createConfiguredPublicSearchService().search(
        normalized.criteria,
      );
    } catch {
      result = null;
    }
  }

  return (
    <PublicShell>
      <div className="search-page">
        <header className="search-page__heading">
          <div>
            <p className="eyebrow">Bakersfield sale directory</p>
            <h1>Find estate sales and yard sales near you</h1>
            <p>
              Browse published listings by sale type and date. List and map
              share this same search state.
            </p>
          </div>
          <div className="search-location-chip">
            <span>Bakersfield, CA</span>
            <small>Current search area</small>
          </div>
        </header>
        <SearchControls criteria={normalized.criteria} />
        <div
          className={`search-page__results search-page__results--${normalized.criteria.view}`}
          aria-live="polite"
          aria-busy="false"
        >
          <SearchResults result={result} issue={normalized.issue} />
        </div>
      </div>
    </PublicShell>
  );
}
