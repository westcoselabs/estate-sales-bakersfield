import type { Metadata } from "next";
import Link from "next/link";

import { PublicShell } from "@/components/shells/shells";

const title = "Privacy at Estate Sales Bakersfield";
const description =
  "A plain-language production-beta summary of account, listing, photo, and location privacy at Estate Sales Bakersfield.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/privacy" },
  openGraph: {
    title,
    description,
    type: "website",
    url: "/privacy",
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

export default function PrivacyPage() {
  return (
    <PublicShell>
      <article className="content-page content-page--legal">
        <header className="content-hero shell-container">
          <p className="eyebrow">Production beta summary</p>
          <h1>Privacy at Estate Sales Bakersfield</h1>
          <p className="marketing-lede">
            This page summarizes current beta behavior in plain language. Final
            public-launch legal copy remains subject to owner approval.
          </p>
        </header>

        <div className="content-legal shell-container">
          <section aria-labelledby="privacy-account-title">
            <h2 id="privacy-account-title">Account information</h2>
            <p>
              The listing workflow uses account information to authenticate
              access and support event publication. Authentication routes use
              the application&apos;s existing cookies, verification,
              abuse-control, token-expiry, and session-revocation behavior.
            </p>
            <p>
              Public sale surfaces must not expose private account credentials,
              raw session data, payment data, or approval digests. A
              seller&apos;s verified account email is displayed publicly on each
              live listing. Optional business name and website details appear
              only when the seller provides them; phone details remain private.
            </p>
          </section>

          <section aria-labelledby="privacy-listing-title">
            <h2 id="privacy-listing-title">Listing and photo information</h2>
            <p>
              Sellers enter sale details and upload photos for a draft. A photo
              is considered saved only after server confirmation. The public
              listing uses the approved publication snapshot and its authorized
              media paths rather than the editable private draft.
            </p>
          </section>

          <section aria-labelledby="privacy-location-title">
            <h2 id="privacy-location-title">Location privacy</h2>
            <p>
              A seller selects one of the supported privacy modes: exact
              address, approximate location, or hidden until the sale starts.
              Public listing cards, detail pages, and future map projections
              must use the same privacy-safe public projection.
            </p>
            <p>
              Approximate and hidden modes must not reveal private street,
              postal code, or exact-coordinate data. A hidden-until-start
              location remains hidden until the authoritative sale start time.
            </p>
            <p>
              Address suggestions are requested from Geoapify through the Estate
              Sales Bakersfield server. Confirmed structured addresses and
              coordinates are stored in Neon/PostGIS for the listing.
              Unconfirmed draft text does not receive fabricated coordinates.
            </p>
          </section>

          <section aria-labelledby="privacy-provider-title">
            <h2 id="privacy-provider-title">Service providers</h2>
            <p>
              The current application relies on configured providers for
              services such as authentication delivery, media storage, payments,
              mapping, hosting, and data persistence. This summary does not
              expand those provider contracts or authorize new uses of personal
              information.
            </p>
            <p>
              Interactive maps use MapLibre GL JS and an OpenFreeMap style. Map
              data includes OpenStreetMap contributors. Address autocomplete and
              controlled geocoding use Geoapify; the browser does not receive
              the private Geoapify credential.
            </p>
          </section>

          <section aria-labelledby="privacy-beta-title">
            <h2 id="privacy-beta-title">Before public launch</h2>
            <p>
              The owner must approve final legal language, contact details,
              retention disclosures, provider disclosures, and any legally
              required request process before this beta is approved for public
              indexing.
            </p>
            <p>
              For current help paths, visit the{" "}
              <Link href="/contact">contact page</Link>. Also review the{" "}
              <Link href="/terms">beta terms summary</Link>.
            </p>
          </section>
        </div>
      </article>
    </PublicShell>
  );
}
