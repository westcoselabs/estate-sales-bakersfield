import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { PublicShell } from "@/components/shells/shells";
import { Icon } from "@/components/ui/icons";
import { EstateHelpCallout } from "@/features/marketing/components";

const title = "How Estate Sales Bakersfield Works";
const description =
  "Learn how to find upcoming Bakersfield sales or create, review, and publish your own estate or yard sale listing.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/how-it-works" },
  openGraph: {
    title,
    description,
    type: "website",
    url: "/how-it-works",
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

export default function HowItWorksPage() {
  return (
    <PublicShell>
      <div className="marketing-page glass-page how-page">
        <section
          className="glass-hero glass-hero--steps"
          aria-labelledby="how-it-works-title"
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
          <div className="glass-hero__panel">
            <p className="eyebrow">How it works</p>
            <h1 id="how-it-works-title">
              Find a local sale or publish your own listing.
            </h1>
            <p className="marketing-lede">
              Estate Sales Bakersfield brings local estate and yard sale
              discovery together with a clear self-service listing workflow.
            </p>
            <ol className="hero-steprail" aria-hidden="true">
              <li>Search</li>
              <li>Review</li>
              <li>Visit</li>
            </ol>
            <div className="marketing-actions">
              <Link className="ui-button ui-button--primary" href="/search">
                Find upcoming sales
              </Link>
              <Link
                className="ui-button ui-button--accent"
                href="/list-your-sale"
              >
                Learn about listing
              </Link>
            </div>
          </div>
        </section>

        <section
          className="marketing-section shell-container"
          aria-labelledby="shopper-process-title"
        >
          <div className="marketing-section__heading">
            <p className="eyebrow">For shoppers</p>
            <h2 id="shopper-process-title">
              See what is happening around Bakersfield.
            </h2>
            <p>
              Browse one shared search experience, narrow it to a useful date,
              and open a listing for the seller&apos;s published details.
            </p>
          </div>
          <ol className="marketing-grid marketing-grid--three content-list content-list--steps">
            <li className="marketing-card glass-card" data-reveal="">
              <span className="marketing-card__icon" aria-hidden="true">
                <Icon name="search" />
              </span>
              <h3>Choose your view</h3>
              <p>
                Start with the list or open the map view from the same search
                results.
              </p>
            </li>
            <li className="marketing-card glass-card" data-reveal="">
              <span className="marketing-card__icon" aria-hidden="true">
                <Icon name="calendar" />
              </span>
              <h3>Pick a date</h3>
              <p>
                Check today, this weekend, the next seven days, or a custom
                range.
              </p>
            </li>
            <li className="marketing-card glass-card" data-reveal="">
              <span className="marketing-card__icon" aria-hidden="true">
                <Icon name="pin" />
              </span>
              <h3>Review the listing</h3>
              <p>
                See the published schedule, photos, and the location detail the
                seller chose to share.
              </p>
            </li>
          </ol>
        </section>

        <section
          className="marketing-section marketing-section--tinted"
          aria-labelledby="seller-process-title"
        >
          <div className="shell-container">
            <div className="marketing-section__heading">
              <p className="eyebrow">For sellers</p>
              <h2 id="seller-process-title">
                Build a listing in five focused steps.
              </h2>
              <p>
                Create a draft first. Verification, review, payment, and the
                authoritative publication result remain explicit throughout the
                process.
              </p>
            </div>
            <ol className="content-list content-list--workflow">
              <li>
                <strong>Details</strong>
                <span>Add the public title, description, and sale type.</span>
              </li>
              <li>
                <strong>Schedule</strong>
                <span>Set the sale&apos;s start and end date and time.</span>
              </li>
              <li>
                <strong>Address and privacy</strong>
                <span>
                  Enter the private location and choose how it may appear
                  publicly.
                </span>
              </li>
              <li>
                <strong>Photos</strong>
                <span>
                  Upload sale photos, arrange them, and choose a cover.
                </span>
              </li>
              <li>
                <strong>Review and payment</strong>
                <span>
                  Preview the exact revision, approve it, and follow the payment
                  and publication status.
                </span>
              </li>
            </ol>
            <div className="marketing-actions">
              <Link className="ui-button ui-button--accent" href="/signup">
                Create an account
              </Link>
              <Link className="ui-text-link" href="/faq">
                Read common questions
              </Link>
            </div>
          </div>
        </section>

        <EstateHelpCallout
          eyebrow="Professional estate-sale help"
          description="Simply Decorated offers professional help with organizing, pricing, staging, and promotion. This is a separate service and is not included in platform listing payment."
          headingId="service-help-title"
        />
      </div>
    </PublicShell>
  );
}
