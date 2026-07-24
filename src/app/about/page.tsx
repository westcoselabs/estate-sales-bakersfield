import type { Metadata } from "next";
import Link from "next/link";

import { PublicShell } from "@/components/shells/shells";
import { Icon } from "@/components/ui/icons";

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
      <div className="marketing-page">
        <section
          className="marketing-hero marketing-hero--compact"
          aria-labelledby="about-title"
        >
          <div className="shell-container marketing-hero__inner">
            <div className="marketing-hero__copy">
              <p className="eyebrow">About the marketplace</p>
              <h1 id="about-title">
                A focused local directory for Bakersfield sales.
              </h1>
              <p className="marketing-lede">
                Estate Sales Bakersfield is being built to make nearby estate
                and yard sales easier to discover while giving organizers a
                clear way to prepare their own listings.
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
            <article className="marketing-card">
              <span className="marketing-card__icon" aria-hidden="true">
                <Icon name="pin" />
              </span>
              <h3>Local by design</h3>
              <p>Search and practical sale guides focus on Bakersfield.</p>
            </article>
            <article className="marketing-card">
              <span className="marketing-card__icon" aria-hidden="true">
                <Icon name="photo" />
              </span>
              <h3>Listing-led</h3>
              <p>
                Real sale photos, schedule information, and organizer-approved
                public details carry the experience.
              </p>
            </article>
            <article className="marketing-card">
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
              <li>Organizers review their listing before payment.</li>
              <li>Important edits can require another review.</li>
              <li>Location visibility follows the selected privacy mode.</li>
              <li>The dashboard shows the current publication status.</li>
            </ul>
          </div>
        </section>

        <section
          className="marketing-section shell-container"
          aria-labelledby="beta-title"
        >
          <div className="marketing-card marketing-card--wide">
            <span className="marketing-card__icon" aria-hidden="true">
              <Icon name="info" />
            </span>
            <div>
              <p className="eyebrow">Production beta</p>
              <h2 id="beta-title">The marketplace is still in beta.</h2>
              <p>
                Public indexing remains disabled while content, inventory,
                privacy, accessibility, and performance are reviewed for a
                future launch. Current pages and workflows may continue to be
                refined before that approval.
              </p>
            </div>
          </div>
        </section>
      </div>
    </PublicShell>
  );
}
