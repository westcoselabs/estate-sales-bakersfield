import Link from "next/link";
import type { ReactNode } from "react";

import { Icon } from "@/components/ui/icons";
import { ExternalLink } from "@/components/ui/primitives";
import {
  ListingCard,
  ListingGridSkeleton,
} from "@/features/search/listing-card";
import {
  createConfiguredPublicSearchService,
  type PublicSearchCriteria,
  type PublicSearchPage,
} from "@/modules/public-search";

export function Breadcrumbs({ current }: { readonly current: string }) {
  return (
    <nav className="marketing-breadcrumbs" aria-label="Breadcrumb">
      <Link href="/">Home</Link>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{current}</span>
    </nav>
  );
}

type SelectedListingsProps = {
  readonly title?: string;
  readonly description?: string;
  readonly moreHref?: string;
};

function SelectedListingsSection({
  children,
  title = "Upcoming sales in Bakersfield",
  description = "Published local listings appear here in soonest-first order.",
  moreHref = "/search",
}: SelectedListingsProps & { readonly children: ReactNode }) {
  return (
    <section
      className="marketing-section selected-listings"
      aria-labelledby="selected-listings-title"
    >
      <div className="marketing-section__heading">
        <div>
          <p className="eyebrow">Plan your next stop</p>
          <h2 id="selected-listings-title">{title}</h2>
          <p>{description}</p>
        </div>
        <Link className="marketing-section__link" href={moreHref}>
          View all sales
          <Icon name="arrow" size={18} />
        </Link>
      </div>
      {children}
    </section>
  );
}

function SelectedListingsResults({
  result,
  moreHref,
}: {
  readonly result: PublicSearchPage | null;
  readonly moreHref: string;
}) {
  return (
    <>
      {result === null ? (
        <div className="marketing-listing-state marketing-listing-state--error">
          <Icon name="warning" size={26} />
          <div>
            <h3>Listings are temporarily unavailable</h3>
            <p>
              The rest of the marketplace is ready. Try the sale directory again
              in a moment.
            </p>
            <Link href={moreHref}>Open the sale directory</Link>
          </div>
        </div>
      ) : result.items.length === 0 ? (
        <div className="marketing-listing-state">
          <Icon name="calendar" size={28} />
          <div>
            <h3>No upcoming published sales yet</h3>
            <p>
              New listings will appear here as organizers publish them and
              reviewed external listings become available. You can still
              explore sale guides or prepare your own listing.
            </p>
            <div className="marketing-actions">
              <Link className="ui-button ui-button--primary" href={moreHref}>
                Browse all dates
              </Link>
              <Link
                className="ui-button ui-button--secondary"
                href="/list-your-sale"
              >
                List your sale
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="market-listing-grid">
          {result.items.map((listing, index) => (
            <ListingCard
              key={listing.resultKey}
              listing={listing}
              priority={index === 0}
            />
          ))}
        </div>
      )}
    </>
  );
}

export async function SelectedListings({
  criteria,
  limit,
  title = "Upcoming sales in Bakersfield",
  description = "Published local listings appear here in soonest-first order.",
  moreHref = "/search",
}: SelectedListingsProps & {
  readonly criteria: PublicSearchCriteria;
  readonly limit: number;
}) {
  let result: PublicSearchPage | null = null;
  try {
    result = await createConfiguredPublicSearchService().search(
      criteria,
      new Date(),
      limit,
    );
  } catch {
    result = null;
  }

  return (
    <SelectedListingsSection
      title={title}
      description={description}
      moreHref={moreHref}
    >
      <SelectedListingsResults result={result} moreHref={moreHref} />
    </SelectedListingsSection>
  );
}

export function SelectedListingsSkeleton({
  count,
  title = "Upcoming sales in Bakersfield",
  description = "Published local listings appear here in soonest-first order.",
  moreHref = "/search",
}: SelectedListingsProps & { readonly count: number }) {
  return (
    <SelectedListingsSection
      title={title}
      description={description}
      moreHref={moreHref}
    >
      <ListingGridSkeleton count={count} />
    </SelectedListingsSection>
  );
}

export function SellerCallout({
  compact = false,
}: {
  readonly compact?: boolean;
}) {
  return (
    <section
      className={`seller-cta ${compact ? "seller-cta--compact" : ""}`}
      aria-labelledby="seller-cta-title"
    >
      <div>
        <p className="eyebrow">For local sellers</p>
        <h2 id="seller-cta-title">
          Give shoppers a clear place to find your sale
        </h2>
        <p>
          Build a five-step listing, choose how the address is shared, review
          the exact public version, then pay when the listing is ready.
        </p>
      </div>
      <Link className="ui-button ui-button--accent" href="/list-your-sale">
        See how listing works
        <Icon name="arrow" size={18} />
      </Link>
    </section>
  );
}

/**
 * The single estate-sale help callout.
 *
 * Replaces both the hand-rolled `service-cta` blocks that were duplicated across
 * how-it-works, list-your-sale and faq, and the older ProfessionalServiceCallout.
 * The heading and link label are fixed because DESIGN.md specifies them; only
 * the eyebrow and description vary per page.
 *
 * `headingId` is a prop rather than `useId()` because these are server
 * components, where hooks are unavailable. No page renders this twice, so the
 * default is safe.
 */
export function EstateHelpCallout({
  eyebrow = "Professional estate-sale help",
  description = "Simply Decorated can help with organizing, pricing, staging, and promotion. This is a separate professional service and is not included with marketplace listing payment.",
  headingId = "estate-help-title",
  className = "",
}: {
  readonly eyebrow?: string;
  readonly description?: string;
  readonly headingId?: string;
  readonly className?: string;
}) {
  return (
    <aside
      className={`estate-help ${className}`.trim()}
      aria-labelledby={headingId}
      data-reveal=""
    >
      <span className="estate-help__icon" aria-hidden="true">
        <Icon name="estate" size={30} />
      </span>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={headingId}>Need hands-on help with your estate sale?</h2>
        <p>{description}</p>
      </div>
      <ExternalLink
        className="ui-button ui-button--secondary"
        href="https://decoratedbyriley.com/estate-sale-companies-bakersfield/"
      >
        <span>Explore Simply Decorated estate-sale services</span>
        <span className="sr-only"> (opens in a new tab)</span>
        <Icon name="external" size={18} />
      </ExternalLink>
    </aside>
  );
}
