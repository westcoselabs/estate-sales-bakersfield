import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { PublicShell } from "@/components/shells/shells";
import { Icon } from "@/components/ui/icons";
import {
  MarketingCard,
  ProfessionalServiceCallout,
  SelectedListings,
  SelectedListingsSkeleton,
  SellerCallout,
} from "@/features/marketing/components";
import { HeroMarquee } from "@/features/marketing/hero-marquee";
import { marketingMetadata } from "@/features/marketing/metadata";
import { normalizeSearchQuery } from "@/modules/public-search";
import { getServerApplicationUrl } from "@/platform/config/application-url";

export const dynamic = "force-dynamic";

export const metadata = marketingMetadata({
  title: "Estate Sales and Yard Sales in Bakersfield, CA",
  description:
    "Find upcoming estate sales and yard sales in Bakersfield, browse by date, or prepare a self-service sale listing.",
  path: "/",
});

export default function HomePage() {
  const defaultSearch = normalizeSearchQuery({}).criteria;
  const applicationUrl = getServerApplicationUrl();
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Estate Sales Bakersfield",
      url: applicationUrl.toString(),
      areaServed: {
        "@type": "City",
        name: "Bakersfield",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Estate Sales Bakersfield",
      url: applicationUrl.toString(),
    },
  ];
  return (
    <PublicShell variant="home">
      <div className="marketing-home">
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero__media" aria-hidden="true">
            <Image
              src="/images/background-estate-hero.webp"
              alt=""
              fill
              priority
              sizes="100vw"
            />
          </div>
          <div className="home-hero__content">
            <p className="home-hero__location">
              <Icon name="pin" size={18} />
              Bakersfield, California
            </p>
            <h1 id="home-title">
              Discover local sales and one-of-a-kind finds.
            </h1>
            <p>
              Browse upcoming estate and yard sales in Bakersfield and plan your
              route to amazing finds.
            </p>
            <form className="home-hero__search" action="/search" method="get">
              <div className="home-hero__location-field">
                <Icon name="pin" size={21} />
                <span>Bakersfield, CA</span>
              </div>
              <label className="home-hero__date-field">
                <span className="sr-only">Sale dates</span>
                <Icon name="calendar" size={20} />
                <select name="date" defaultValue="all">
                  <option value="all">Select dates</option>
                  <option value="today">Today</option>
                  <option value="weekend">This weekend</option>
                  <option value="next-7-days">Next 7 days</option>
                </select>
                <Icon
                  className="home-hero__date-chevron"
                  name="chevron"
                  size={18}
                />
              </label>
              <button type="submit" aria-label="Search sales">
                <Icon name="search" size={21} />
                <span>Search</span>
              </button>
            </form>
          </div>
          <HeroMarquee />
        </section>

        <Suspense fallback={<SelectedListingsSkeleton count={4} />}>
          <SelectedListings criteria={defaultSearch} limit={4} />
        </Suspense>

        <section
          className="marketing-section home-categories"
          aria-labelledby="category-title"
        >
          <div className="marketing-section__heading">
            <div>
              <p className="eyebrow">Choose a sale type</p>
              <h2 id="category-title">Start with the kind of sale you want</h2>
              <p>
                Both paths lead into the same directory, with consistent cards
                and date filters.
              </p>
            </div>
          </div>
          <div className="marketing-grid marketing-grid--categories">
            <MarketingCard
              icon="estate"
              title="Estate sales"
              href="/estate-sales"
              linkLabel="Explore estate sales"
            >
              <p>
                Learn what to expect, view selected upcoming listings, then open
                the shared estate-sale results.
              </p>
            </MarketingCard>
            <MarketingCard
              icon="yard"
              title="Yard sales"
              href="/yard-sales"
              linkLabel="Explore yard sales"
            >
              <p>
                Browse a practical local guide and open yard-sale results with
                the filter already applied.
              </p>
            </MarketingCard>
          </div>
        </section>

        <section className="home-discovery-pair">
          <article className="home-map-teaser">
            <span aria-hidden="true">
              <Icon name="map" size={34} />
            </span>
            <div>
              <p className="eyebrow">Map view in preparation</p>
              <h2>Your filters stay with the same shared search</h2>
              <p>
                List view is ready now. The map preview keeps you in the same
                search and explains its current availability.
              </p>
              <Link
                className="ui-button ui-button--secondary"
                href="/search?view=map"
              >
                View map availability
                <Icon name="arrow" size={18} />
              </Link>
            </div>
          </article>
          <article className="home-how-card">
            <p className="eyebrow">How it works</p>
            <h2>From nearby search to a sale worth visiting</h2>
            <ol>
              <li>
                <strong>Choose a date.</strong>
                <span>Start with today, this weekend, or the next 7 days.</span>
              </li>
              <li>
                <strong>Scan real listing photos.</strong>
                <span>Compare the schedule and privacy-safe location.</span>
              </li>
              <li>
                <strong>Open the full listing.</strong>
                <span>Review the published sale details.</span>
              </li>
            </ol>
            <Link href="/how-it-works">
              See how the marketplace works
              <Icon name="arrow" size={17} />
            </Link>
          </article>
        </section>

        <section
          className="marketing-section home-trust"
          aria-labelledby="trust-title"
        >
          <div className="home-trust__intro">
            <span aria-hidden="true">
              <Icon name="shield" size={30} />
            </span>
            <div>
              <p className="eyebrow">Clear by design</p>
              <h2 id="trust-title">
                Trust comes from showing only what is ready
              </h2>
              <p>
                Listings appear only after publication is confirmed. Address
                visibility follows the organizer&apos;s exact, approximate, or
                hidden-until-start choice.
              </p>
            </div>
          </div>
          <div className="home-trust__points">
            <div>
              <strong>Published listings only</strong>
              <span>Private drafts never appear in public search.</span>
            </div>
            <div>
              <strong>Privacy-safe location</strong>
              <span>
                Cards never expose private coordinates or raw addresses.
              </span>
            </div>
            <div>
              <strong>Confirmed publication</strong>
              <span>A sale is shown only after it is ready to be public.</span>
            </div>
          </div>
        </section>

        <SellerCallout />
        <ProfessionalServiceCallout />

        <section
          className="marketing-section home-faq-preview"
          aria-labelledby="home-faq-title"
        >
          <div className="marketing-section__heading">
            <div>
              <p className="eyebrow">Common questions</p>
              <h2 id="home-faq-title">Know before you browse or list</h2>
            </div>
            <Link className="marketing-section__link" href="/faq">
              View all questions
              <Icon name="arrow" size={18} />
            </Link>
          </div>
          <div className="home-faq-preview__grid">
            <article>
              <h3>When is an exact address shown?</h3>
              <p>
                It depends on the organizer&apos;s approved privacy setting.
                Some listings show only an area or wait until the sale starts.
              </p>
            </article>
            <article>
              <h3>Can I list either sale type?</h3>
              <p>
                Yes. The current marketplace supports estate sales and yard
                sales through the same five-step builder.
              </p>
            </article>
            <article>
              <h3>When does a listing become public?</h3>
              <p>
                Only after the listing is ready, approved, paid, and the server
                confirms publication.
              </p>
            </article>
          </div>
        </section>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c"),
        }}
      />
    </PublicShell>
  );
}
