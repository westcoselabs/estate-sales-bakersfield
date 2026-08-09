import Link from "next/link";
import { Suspense } from "react";

import { PublicShell } from "@/components/shells/shells";
import { Icon } from "@/components/ui/icons";
import {
  Breadcrumbs,
  EstateHelpCallout,
  SelectedListings,
  SelectedListingsSkeleton,
  SellerCallout,
} from "@/features/marketing/components";
import { marketingMetadata } from "@/features/marketing/metadata";
import { normalizeSearchQuery } from "@/modules/public-search";
import { getServerApplicationUrl } from "@/platform/config/application-url";

export const dynamic = "force-dynamic";

export const metadata = marketingMetadata({
  title: "Upcoming Estate Sales in Bakersfield, CA",
  description:
    "Learn what to expect at Bakersfield estate sales, view selected upcoming listings, and open estate-sale results.",
  path: "/estate-sales",
});

export default function EstateSalesHubPage() {
  const criteria = normalizeSearchQuery({ sale: "estate" }).criteria;
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
        name: "Estate sales",
        item: new URL("/estate-sales", applicationUrl).toString(),
      },
    ],
  };
  return (
    <PublicShell>
      <div className="marketing-page category-page category-page--estate">
        <Breadcrumbs current="Estate sales" />
        <section className="category-hero">
          <div>
            <p className="eyebrow">Estate sales in Bakersfield</p>
            <h1>Discover upcoming Bakersfield estate sales</h1>
            <p>
              Explore household collections, furnishings, decor, and everyday
              finds through organizer-published and reviewed external listings.
            </p>
            <div className="marketing-actions">
              <Link
                className="ui-button ui-button--primary"
                href="/search?sale=estate"
              >
                Browse estate-sale results
                <Icon name="search" size={19} />
              </Link>
              <Link
                className="ui-button ui-button--secondary"
                href="/search?sale=estate&date=weekend"
              >
                This weekend
              </Link>
            </div>
          </div>
          <aside>
            <Icon name="estate" size={34} />
            <h2>What makes an estate sale different?</h2>
            <p>
              Estate sales often cover a larger portion of a home&apos;s
              contents and may run across multiple days. Each listing sets its
              own schedule and address-privacy choice.
            </p>
          </aside>
        </section>

        <Suspense
          fallback={
            <SelectedListingsSkeleton
              count={3}
              title="Selected upcoming estate sales"
              description="A look at the next estate sales currently published in the directory."
              moreHref="/search?sale=estate"
            />
          }
        >
          <SelectedListings
            criteria={criteria}
            limit={3}
            title="Selected upcoming estate sales"
            description="A look at the next estate sales currently published in the directory."
            moreHref="/search?sale=estate"
          />
        </Suspense>

        <section
          className="marketing-section category-guide"
          aria-labelledby="estate-guide-title"
        >
          <div>
            <p className="eyebrow">Before you go</p>
            <h2 id="estate-guide-title">
              Plan around the listing, not assumptions
            </h2>
          </div>
          <div className="category-guide__grid">
            <article>
              <h3>Check the schedule</h3>
              <p>
                Sale dates and times come from the published listing. Review
                them again before you leave.
              </p>
            </article>
            <article>
              <h3>Respect address privacy</h3>
              <p>
                A listing may show an exact address, an approximate area, or
                release the address when the sale begins.
              </p>
            </article>
            <article>
              <h3>Use photos as a preview</h3>
              <p>
                Listing photography helps with planning, but item availability
                can change during the sale.
              </p>
            </article>
          </div>
        </section>

        <SellerCallout compact />
        <EstateHelpCallout />
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
