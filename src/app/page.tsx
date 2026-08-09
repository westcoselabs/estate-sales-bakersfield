import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { PublicShell } from "@/components/shells/shells";
import { Icon } from "@/components/ui/icons";
import {
  EstateHelpCallout,
  SelectedListings,
  SelectedListingsSkeleton,
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
      <div className="marketing-home glass-page home-page">
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

        {/* Live listings. The bento and mobile rail are pure layout overrides on
            `.market-listing-grid`, so ListingCard and its glass stay untouched. */}
        <Suspense
          fallback={
            <SelectedListingsSkeleton
              count={3}
              title="Sales coming up in Bakersfield"
              description="Published listings, soonest first. Every one is live and ready to visit."
            />
          }
        >
          <SelectedListings
            criteria={defaultSearch}
            limit={3}
            title="Sales coming up in Bakersfield"
            description="Published listings, soonest first. Every one is live and ready to visit."
          />
        </Suspense>

        <section className="home-paths" aria-labelledby="paths-title">
          <h2 className="sr-only" id="paths-title">
            Choose a kind of sale
          </h2>
          <Link className="home-path home-path--estate" href="/estate-sales">
            <span className="home-path__media" aria-hidden="true">
              <Image
                src="/images/marketplace-hero.webp"
                alt=""
                fill
                sizes="(max-width: 767px) 100vw, 60vw"
              />
            </span>
            <span className="home-path__scrim" aria-hidden="true" />
            <span className="home-path__panel">
              <span className="eyebrow">Estate sales</span>
              <span className="home-path__title">Whole homes, opened up</span>
              <span className="home-path__copy">
                Furniture, decor, tools, and the contents of a lifetime. Usually
                multi-day, usually worth arriving early.
              </span>
              <span className="home-path__cta">
                Explore estate sales
                <Icon name="arrow" size={18} />
              </span>
            </span>
          </Link>
          <Link className="home-path home-path--yard" href="/yard-sales">
            <span className="home-path__media" aria-hidden="true">
              <Image
                src="/images/estate-sales-bakersfield (8).webp"
                alt=""
                fill
                sizes="(max-width: 767px) 100vw, 38vw"
              />
            </span>
            <span className="home-path__scrim" aria-hidden="true" />
            <span className="home-path__panel">
              <span className="eyebrow">Yard sales</span>
              <span className="home-path__title">Weekend finds, close by</span>
              <span className="home-path__copy">
                Smaller, faster, and often a single morning. Perfect for a short
                route through the neighborhood.
              </span>
              <span className="home-path__cta">
                Explore yard sales
                <Icon name="arrow" size={18} />
              </span>
            </span>
          </Link>
        </section>

        <section
          className="marketing-section home-journey"
          aria-labelledby="journey-title"
        >
          <div className="marketing-section__heading">
            <div>
              <p className="eyebrow">How it works</p>
              <h2 id="journey-title">
                From a search to a sale worth the drive
              </h2>
              <p>
                Three steps, no account needed to browse. The same filters carry
                straight through to the map view.
              </p>
            </div>
            <Link className="marketing-section__link" href="/how-it-works">
              See the full walkthrough
              <Icon name="arrow" size={18} />
            </Link>
          </div>
          <ol className="home-journey__steps">
            <li data-reveal="">
              <span className="home-journey__icon" aria-hidden="true">
                <Icon name="calendar" size={22} />
              </span>
              <h3>Pick a date</h3>
              <p>
                Today, this weekend, the next seven days, or a range you choose.
                Weekends resolve on Bakersfield time.
              </p>
            </li>
            <li data-reveal="">
              <span className="home-journey__icon" aria-hidden="true">
                <Icon name="photo" size={22} />
              </span>
              <h3>Scan the key details</h3>
              <p>
                Every listing shows its schedule, description, source, and a
                privacy-safe location before you commit.
              </p>
            </li>
            <li data-reveal="">
              <span className="home-journey__icon" aria-hidden="true">
                <Icon name="pin" size={22} />
              </span>
              <h3>Plan the route</h3>
              <p>
                Open the full listing for details, then line up the sales worth
                your morning.
              </p>
            </li>
          </ol>
        </section>

        <section
          className="marketing-section home-trust"
          aria-labelledby="trust-title"
        >
          <div className="marketing-section__heading">
            <div>
              <p className="eyebrow">Clear by design</p>
              <h2 id="trust-title">
                You only ever see what is genuinely ready
              </h2>
              <p>
                Nothing reaches this page early. Every listing is either
                published by its organizer or explicitly reviewed before it
                appears here.
              </p>
            </div>
          </div>
          <div className="home-trust__bento">
            <article
              className="marketing-card glass-card home-trust__tile home-trust__tile--wide"
              data-reveal=""
            >
              <span className="marketing-card__icon" aria-hidden="true">
                <Icon name="shield" />
              </span>
              <h3>Public locations stay privacy-safe</h3>
              <p>
                Organizer choices and reviewed external-listing defaults keep
                exact addresses, approximate areas, and start-time-hidden
                locations consistent across cards, maps, and details.
              </p>
            </article>
            <article
              className="marketing-card glass-card home-trust__tile"
              data-reveal=""
            >
              <span className="marketing-card__icon" aria-hidden="true">
                <Icon name="check" />
              </span>
              <h3>Published only</h3>
              <p>
                Private drafts and unreviewed imports never surface in public
                search or on this page.
              </p>
            </article>
            <article
              className="marketing-card glass-card home-trust__tile"
              data-reveal=""
            >
              <span className="marketing-card__icon" aria-hidden="true">
                <Icon name="status" />
              </span>
              <h3>Confirmed, not assumed</h3>
              <p>
                A sale appears only after confirmed organizer publication or
                explicit external-listing review.
              </p>
            </article>
          </div>
        </section>

        <section className="home-sell" aria-labelledby="sell-title">
          <span className="home-sell__bloom" aria-hidden="true" />
          <div className="home-sell__inner">
            <div className="home-sell__copy">
              <p className="eyebrow">For local sellers</p>
              <h2 id="sell-title">
                Give your sale a place people actually look.
              </h2>
              <p>
                Build your listing in five focused steps, decide exactly how
                much of your address is shared, review the real public version,
                and pay only when it is ready to go live.
              </p>
            </div>
            <div className="home-sell__actions">
              <Link
                className="ui-button ui-button--accent"
                href="/list-your-sale"
              >
                <span>Start a listing</span>
                <Icon name="arrow" size={18} />
              </Link>
              <Link className="home-sell__secondary" href="/how-it-works">
                See how listing works
              </Link>
            </div>
          </div>
        </section>

        <EstateHelpCallout />

        <section
          className="marketing-section home-faq"
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
          <div className="content-faq">
            <details className="content-faq__item" data-reveal="">
              <summary>
                <span>When is an exact address shown?</span>
                <Icon name="plus" size={19} />
              </summary>
              <div className="content-faq__answer">
                <div>
                  <p>
                    It depends on the organizer&apos;s approved privacy setting.
                    Some listings show only an area, and some hold the address
                    back until the sale starts.
                  </p>
                </div>
              </div>
            </details>
            <details className="content-faq__item" data-reveal="">
              <summary>
                <span>Can I list either kind of sale?</span>
                <Icon name="plus" size={19} />
              </summary>
              <div className="content-faq__answer">
                <div>
                  <p>
                    Yes. Estate sales and yard sales both run through the same
                    five-step builder and the same review process.
                  </p>
                </div>
              </div>
            </details>
            <details className="content-faq__item" data-reveal="">
              <summary>
                <span>When does a listing become public?</span>
                <Icon name="plus" size={19} />
              </summary>
              <div className="content-faq__answer">
                <div>
                  <p>
                    Organizer listings appear after approval, payment, and
                    confirmed publication. Reviewed external listings appear
                    only after explicit super-admin approval.
                  </p>
                </div>
              </div>
            </details>
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
