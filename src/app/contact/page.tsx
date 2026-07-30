import type { Metadata } from "next";
import Link from "next/link";

import { PublicShell } from "@/components/shells/shells";
import { Icon } from "@/components/ui/icons";

const title = "Contact Estate Sales Bakersfield";
const description =
  "Find the current help paths for Estate Sales Bakersfield shoppers and sellers during the production beta.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/contact" },
  openGraph: {
    title,
    description,
    type: "website",
    url: "/contact",
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

export default function ContactPage() {
  return (
    <PublicShell>
      <div className="content-page glass-page contact-page">
        <header className="glass-hero glass-hero--aurora">
          <div className="hero-chips" aria-hidden="true">
            <span>@</span>
            <span>?</span>
            <span>!</span>
          </div>
          <div className="glass-hero__panel">
            <p className="eyebrow">Help and support</p>
            <h1>How can we help?</h1>
            <p className="marketing-lede">
              A direct public support channel is still being finalized for this
              production beta. We will not ask you to use an unverified email,
              phone number, or contact form.
            </p>
          </div>
        </header>

        <section
          className="content-section shell-container"
          aria-labelledby="support-options-title"
        >
          <div className="marketing-section__heading">
            <h2 id="support-options-title">Use the path available today.</h2>
            <p>
              These links can answer common questions or return you to your
              current account and listing status.
            </p>
          </div>
          <div className="marketing-grid marketing-grid--three">
            <article className="marketing-card glass-card" data-reveal="">
              <span className="marketing-card__icon" aria-hidden="true">
                <Icon name="info" />
              </span>
              <h3>Read common answers</h3>
              <p>
                Review current guidance about dates, privacy, photos, approval,
                payment, and publication.
              </p>
              <Link className="ui-text-link" href="/faq">
                Open the FAQ
              </Link>
            </article>
            <article className="marketing-card glass-card" data-reveal="">
              <span className="marketing-card__icon" aria-hidden="true">
                <Icon name="home" />
              </span>
              <h3>Check your dashboard</h3>
              <p>
                Signed-in sellers can review account verification, drafts,
                listings, and the next action shown by the application.
              </p>
              <Link className="ui-text-link" href="/dashboard">
                Go to dashboard
              </Link>
            </article>
            <article className="marketing-card glass-card" data-reveal="">
              <span className="marketing-card__icon" aria-hidden="true">
                <Icon name="user" />
              </span>
              <h3>Return to your account</h3>
              <p>
                Log in to continue an existing draft or inspect a listing&apos;s
                current workflow status.
              </p>
              <Link className="ui-text-link" href="/login">
                Log in
              </Link>
            </article>
          </div>
        </section>

        <section
          className="content-section shell-container"
          aria-labelledby="channel-update-title"
        >
          <div className="marketing-card marketing-card--wide" data-reveal="">
            <span className="marketing-card__icon" aria-hidden="true">
              <Icon name="status" />
            </span>
            <div>
              <h2 id="channel-update-title">
                The approved contact destination will appear here.
              </h2>
              <p>
                A support email, phone number, or onsite submission form will
                not be published until its destination, handling process, and
                privacy expectations are approved.
              </p>
            </div>
          </div>
        </section>
      </div>
    </PublicShell>
  );
}
