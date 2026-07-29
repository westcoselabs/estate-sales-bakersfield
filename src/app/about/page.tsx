import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { PublicShell } from "@/components/shells/shells";
import { Icon } from "@/components/ui/icons";
import { EstateHelpCallout } from "@/features/marketing/components";

const title = "About Estate Sales Bakersfield";
const description =
  "Learn about the local purpose, organizer responsibilities, and privacy boundaries behind Estate Sales Bakersfield.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/about" },
  openGraph: {
    title,
    description,
    type: "website",
    url: "/about",
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

export default function AboutPage() {
  return (
    <PublicShell>
      <div className="marketing-page glass-page about-page">
        <section className="glass-hero" aria-labelledby="about-title">
          <div className="glass-hero__media" aria-hidden="true">
            <Image
              src="/images/marketplace-hero.webp"
              alt=""
              fill
              priority
              sizes="100vw"
            />
          </div>
          <div className="glass-hero__scrim" aria-hidden="true" />
          <div className="glass-hero__panel">
            <p className="eyebrow">About the marketplace</p>
            <h1 id="about-title">
              A focused local directory for Bakersfield sales.
            </h1>
            <p className="marketing-lede">
              Estate Sales Bakersfield is being built to make nearby estate and
              yard sales easier to discover while giving organizers a clear way
              to prepare their own listings.
            </p>
            <div className="marketing-actions">
              <Link className="ui-button ui-button--primary" href="/search">
                Explore sales
              </Link>
              <Link
                className="ui-button ui-button--secondary"
                href="/how-it-works"
              >
                See how it works
              </Link>
            </div>
          </div>
        </section>

        <section
          className="marketing-section shell-container"
          aria-labelledby="purpose-title"
        >
          <div className="marketing-section__heading">
            <p className="eyebrow">Our purpose</p>
            <h2 id="purpose-title">
              Useful local sale details, clearly presented.
            </h2>
            <p>
              The public experience centers on published estate and yard sale
              listings, with dates, photos, and location notes that are easy to
              scan.
            </p>
          </div>
          <div className="marketing-grid marketing-grid--three">
            <article className="marketing-card glass-card" data-reveal="">
              <span className="marketing-card__icon" aria-hidden="true">
                <Icon name="pin" />
              </span>
              <h3>Local by design</h3>
              <p>Search and practical sale guides focus on Bakersfield.</p>
            </article>
            <article className="marketing-card glass-card" data-reveal="">
              <span className="marketing-card__icon" aria-hidden="true">
                <Icon name="photo" />
              </span>
              <h3>Listing-led</h3>
              <p>
                Real sale photos, schedule information, and organizer-approved
                public details carry the experience.
              </p>
            </article>
            <article className="marketing-card glass-card" data-reveal="">
              <span className="marketing-card__icon" aria-hidden="true">
                <Icon name="shield" />
              </span>
              <h3>Privacy-aware</h3>
              <p>
                Public pages show only the location details the organizer chose
                to share.
              </p>
            </article>
          </div>
        </section>

        <section
          className="marketing-section marketing-section--tinted"
          aria-labelledby="responsibility-title"
        >
          <div className="shell-container marketing-split">
            <div className="marketing-section__heading">
              <p className="eyebrow">Clear roles</p>
              <h2 id="responsibility-title">
                Organizers remain responsible for their listing.
              </h2>
              <p>
                The platform provides the account, builder, approval, payment,
                and publication workflow. Organizers provide and review the sale
                information they submit.
              </p>
            </div>
            <ul className="content-list content-list--checks">
              <li data-reveal="">
                Organizers review their listing before payment.
              </li>
              <li data-reveal="">
                Important edits can require another review.
              </li>
              <li data-reveal="">
                Location visibility follows the selected privacy mode.
              </li>
              <li data-reveal="">
                The dashboard shows the current publication status.
              </li>
            </ul>
          </div>
        </section>

        <EstateHelpCallout
          eyebrow="Professional estate-sale help"
          headingId="about-service-title"
        />
      </div>
    </PublicShell>
  );
}
