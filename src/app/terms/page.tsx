import type { Metadata } from "next";
import Link from "next/link";

import { PublicShell } from "@/components/shells/shells";

const title = "Estate Sales Bakersfield Beta Terms Summary";
const description =
  "A plain-language summary of the current production-beta listing, approval, payment, and publication rules.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/terms" },
  openGraph: {
    title,
    description,
    type: "website",
    url: "/terms",
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

export default function TermsPage() {
  return (
    <PublicShell>
      <article className="content-page content-page--legal">
        <header className="content-hero shell-container">
          <p className="eyebrow">Production beta summary</p>
          <h1>Estate Sales Bakersfield beta terms summary</h1>
          <p className="marketing-lede">
            This page summarizes current application behavior and is not the
            final public-launch legal agreement. Final legal copy remains
            subject to owner approval.
          </p>
        </header>

        <div className="content-legal shell-container">
          <section aria-labelledby="terms-platform-title">
            <h2 id="terms-platform-title">Platform role</h2>
            <p>
              Estate Sales Bakersfield provides a workflow for organizers to
              prepare estate and yard sale listings and a public directory for
              eligible published listings. The platform listing flow is separate
              from any professional estate-sale service.
            </p>
          </section>

          <section aria-labelledby="terms-account-title">
            <h2 id="terms-account-title">Accounts and organizer information</h2>
            <p>
              Organizers use an authenticated account, verify their email, and
              complete required profile information before restricted listing
              actions become available. Existing authentication, session, and
              abuse-control rules remain authoritative.
            </p>
          </section>

          <section aria-labelledby="terms-content-title">
            <h2 id="terms-content-title">Listing content</h2>
            <p>
              Organizers provide and review the title, description, sale type,
              schedule, location, privacy choice, and photos submitted for their
              listing. Only the supported estate sale and yard sale types are
              currently accepted by the builder.
            </p>
            <p>
              Content must complete the application&apos;s validation and media
              requirements before it can reach approval. A private draft is not
              a public listing.
            </p>
          </section>

          <section aria-labelledby="terms-approval-title">
            <h2 id="terms-approval-title">
              Approval, payment, and publication
            </h2>
            <p>
              Approval applies to an exact listing revision and the versioned
              terms presented by the application. Material changes create a new
              revision that requires review and approval again.
            </p>
            <p>
              Payment availability depends on the current backend eligibility
              rules. Returning from checkout does not by itself publish a
              listing. Authoritative payment processing and publication state
              determine whether the listing becomes public.
            </p>
          </section>

          <section aria-labelledby="terms-privacy-title">
            <h2 id="terms-privacy-title">Location and public information</h2>
            <p>
              The public listing follows the organizer&apos;s supported location
              privacy choice. Public surfaces must use the approved publication
              projection and must not substitute private draft, account,
              payment, or exact-coordinate data.
            </p>
            <p>
              Address selection uses server-mediated Geoapify results. Confirmed
              structured addresses and coordinates may be stored permanently in
              Neon/PostGIS. Interactive maps use MapLibre GL JS, OpenFreeMap,
              and OpenStreetMap-derived map data with visible attribution.
            </p>
          </section>

          <section aria-labelledby="terms-status-title">
            <h2 id="terms-status-title">
              Listing availability and beta status
            </h2>
            <p>
              Published listings can become unavailable under existing
              cancellation, removal, schedule, and publication rules. This
              production beta remains blocked from public indexing until a
              separate launch review approves its legal, content, privacy,
              accessibility, performance, and inventory posture.
            </p>
            <p>
              Read the <Link href="/privacy">privacy summary</Link> or visit the{" "}
              <Link href="/contact">current support options</Link>.
            </p>
          </section>
        </div>
      </article>
    </PublicShell>
  );
}
