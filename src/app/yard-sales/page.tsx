import Link from "next/link";
import { Suspense } from "react";

import { PublicShell } from "@/components/shells/shells";
import { Icon } from "@/components/ui/icons";
import {
  Breadcrumbs,
  SelectedListings,
  SelectedListingsSkeleton,
  SellerCallout,
} from "@/features/marketing/components";
import { marketingMetadata } from "@/features/marketing/metadata";
import { normalizeSearchQuery } from "@/modules/public-search";
import { getServerApplicationUrl } from "@/platform/config/application-url";

export const dynamic = "force-dynamic";

export const metadata = marketingMetadata({
  title: "Upcoming Yard Sales in Bakersfield, CA",
  description:
    "Plan a Bakersfield yard-sale outing, view selected upcoming listings, and open yard-sale results in the shared directory.",
  path: "/yard-sales",
});

export default function YardSalesHubPage() {
  const criteria = normalizeSearchQuery({ sale: "yard" }).criteria;
  const applicationUrl = getServerApplicationUrl();
  const breadcrumbData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: new URL("/", applicationUrl).toString(),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Yard sales",
        item: new URL("/yard-sales", applicationUrl).toString(),
      },
    ],
  };
  return (
    <PublicShell>
      <div className="marketing-page category-page category-page--yard">
        <Breadcrumbs current="Yard sales" />
        <section className="category-hero">
          <div>
            <p className="eyebrow">Yard sales in Bakersfield</p>
            <h1>Find upcoming Bakersfield yard sales</h1>
            <p>
              Browse local published listings, choose a date that fits your
              plans, and check each listing&apos;s schedule, source, and
              location details.
            </p>
            <div className="marketing-actions">
              <Link
                className="ui-button ui-button--primary"
                href="/search?sale=yard"
              >
                Browse yard-sale results
                <Icon name="search" size={19} />
              </Link>
              <Link
                className="ui-button ui-button--secondary"
                href="/search?sale=yard&date=weekend"
              >
                This weekend
              </Link>
            </div>
          </div>
          <aside>
            <Icon name="yard" size={34} />
            <h2>A simple way to plan nearby stops</h2>
            <p>
              Use sale type and date filters to narrow the shared directory.
              Then open each listing to review the seller&apos;s published
              details.
            </p>
          </aside>
        </section>

        <Suspense
          fallback={
            <SelectedListingsSkeleton
              count={3}
              title="Selected upcoming yard sales"
              description="A look at the next yard sales currently published in the directory."
              moreHref="/search?sale=yard"
            />
          }
        >
          <SelectedListings
            criteria={criteria}
            limit={3}
            title="Selected upcoming yard sales"
            description="A look at the next yard sales currently published in the directory."
            moreHref="/search?sale=yard"
          />
        </Suspense>

        <section
          className="marketing-section category-guide"
          aria-labelledby="yard-guide-title"
        >
          <div>
            <p className="eyebrow">Browse with confidence</p>
            <h2 id="yard-guide-title">The useful details stay easy to scan</h2>
          </div>
          <div className="category-guide__grid">
            <article>
              <h3>Start with the date</h3>
              <p>
                Today, This weekend, and Next 7 days all use Bakersfield local
                time.
              </p>
            </article>
            <article>
              <h3>Read the location note</h3>
              <p>
                The card explains whether the location is exact, approximate, or
                held until the sale starts.
              </p>
            </article>
            <article>
              <h3>Open the published listing</h3>
              <p>
                Review the full schedule, photos, and location note before you
                make plans.
              </p>
            </article>
          </div>
        </section>

        <SellerCallout compact />
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbData).replaceAll("<", "\\u003c"),
        }}
      />
    </PublicShell>
  );
}
