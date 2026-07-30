import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { PublicShell } from "@/components/shells/shells";
import { Icon } from "@/components/ui/icons";
import { EstateHelpCallout } from "@/features/marketing/components";

const title = "List Your Estate or Yard Sale in Bakersfield";
const description =
  "Prepare and publish a Bakersfield estate or yard sale listing through a clear, privacy-aware self-service workflow.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/list-your-sale" },
  openGraph: {
    title,
    description,
    type: "website",
    url: "/list-your-sale",
    siteName: "Estate Sales Bakersfield",
    images: [
      {
        url: "/images/marketplace-hero.webp",
        width: 1774,
        height: 887,
        alt: "A thoughtfully arranged Bakersfield home interior",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/images/marketplace-hero.webp"],
  },
};

export default function ListYourSalePage() {
  return (
    <PublicShell>
      <div className="marketing-page glass-page list-page">
        <section
          className="glass-hero glass-hero--seller"
          aria-labelledby="list-sale-title"
        >
          <div className="glass-hero__media" aria-hidden="true">
            <Image
              src="/images/background-estate-hero.webp"
              alt=""
              fill
              priority
              sizes="100vw"
            />
          </div>
          <div className="glass-hero__scrim" aria-hidden="true" />
          {/* A mock of the published result. The portrait source is only
              381px wide, which suits this card but not a full-bleed hero. */}
          <div className="hero-listing-preview" aria-hidden="true">
            <div className="hero-listing-preview__media">
              <Image
                src="/images/estate-sales-bakersfield (3).webp"
                alt=""
                width={381}
                height={572}
              />
            </div>
            <span className="hero-listing-preview__badge">Published</span>
            <div className="hero-listing-preview__line" />
            <div className="hero-listing-preview__line hero-listing-preview__line--short" />
          </div>
          <div className="glass-hero__panel">
            <p className="eyebrow">Self-service listing</p>
            <h1 id="list-sale-title">
              Give your Bakersfield sale a clear place to be found.
            </h1>
            <p className="marketing-lede">
              Build a photo-forward estate or yard sale listing, review the
              exact version, and follow its approval, payment, and publication
              status from your dashboard.
            </p>
            <div className="marketing-actions">
              <Link className="ui-button ui-button--accent" href="/signup">
                Create an account
              </Link>
              <Link className="ui-text-link" href="/login">
                Log in to continue a draft
              </Link>
            </div>
          </div>
        </section>

        <section
          className="marketing-section shell-container"
          aria-labelledby="self-service-title"
        >
          <div className="marketing-section__heading">
            <p className="eyebrow">A practical fit</p>
            <h2 id="self-service-title">Self-service keeps you in control.</h2>
            <p>
              This workflow is for sellers who want to prepare and manage their
              own public listing. It does not include professional sale
              organization or staging services.
            </p>
          </div>
          <div className="marketing-grid marketing-grid--three">
            <article className="marketing-card glass-card" data-reveal="">
              <span className="marketing-card__icon" aria-hidden="true">
                <Icon name="edit" />
              </span>
              <h3>Prepare a draft</h3>
              <p>
                Add details over time and keep the draft private until the
                required steps are complete.
              </p>
            </article>
            <article className="marketing-card glass-card" data-reveal="">
              <span className="marketing-card__icon" aria-hidden="true">
                <Icon name="shield" />
              </span>
              <h3>Choose location privacy</h3>
              <p>
                Select an exact, approximate, or hidden-until-start location
                treatment for the public listing.
              </p>
            </article>
            <article className="marketing-card glass-card" data-reveal="">
              <span className="marketing-card__icon" aria-hidden="true">
                <Icon name="status" />
              </span>
              <h3>Follow real status</h3>
              <p>
                The dashboard distinguishes draft, approval, payment, and
                published states and shows the next available action.
              </p>
            </article>
          </div>
        </section>

        <section
          className="marketing-section marketing-section--tinted"
          aria-labelledby="prepare-title"
        >
          <div className="shell-container marketing-split">
            <div className="marketing-section__heading">
              <p className="eyebrow">Before you begin</p>
              <h2 id="prepare-title">Gather the details shoppers need.</h2>
              <p>
                You can start a draft before everything is ready. These pieces
                are required before the listing can reach review.
              </p>
            </div>
            <ul className="content-list content-list--checks">
              <li data-reveal="">A public title and description</li>
              <li data-reveal="">The estate sale or yard sale type</li>
              <li data-reveal="">Start and end dates and times</li>
              <li data-reveal="">A verified location and privacy choice</li>
              <li data-reveal="">Uploaded photos with a selected cover</li>
              <li data-reveal="">A verified account email</li>
            </ul>
          </div>
        </section>

        <section
          className="marketing-section shell-container"
          aria-labelledby="payment-title"
        >
          <div className="marketing-card marketing-card--wide">
            <span className="marketing-card__icon" aria-hidden="true">
              <Icon name="check" />
            </span>
            <div>
              <p className="eyebrow">Review before payment</p>
              <h2 id="payment-title">
                Approve the exact listing revision first.
              </h2>
              <p>
                Material changes after approval create a new revision that must
                be reviewed again. Payment becomes available only when the
                current revision meets the existing approval rules. The
                authoritative payment and publication state appears in the
                dashboard.
              </p>
              <p>
                Public pricing is not stated here because this beta does not
                expose an approved public fee source.
              </p>
            </div>
          </div>
        </section>

        <EstateHelpCallout
          eyebrow="Prefer professional support?"
          description="Simply Decorated offers a separate professional service for organizing, pricing, staging, and promoting an estate sale."
          headingId="service-title"
        />
      </div>
    </PublicShell>
  );
}
