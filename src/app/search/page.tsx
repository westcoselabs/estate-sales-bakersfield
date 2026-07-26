import type { Metadata } from "next";
import { headers } from "next/headers";

import { PublicShell } from "@/components/shells/shells";
import { ExploreResultsShell } from "@/features/search/explore-results";
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
      <ExploreResultsShell
        criteria={normalized.criteria}
        result={result}
        issue={normalized.issue}
      />
    </PublicShell>
  );
}
