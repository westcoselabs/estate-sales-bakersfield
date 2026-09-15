import type { Metadata } from "next";
import Link from "next/link";

import { PublicShell } from "@/components/shells/shells";

const title = "Estate Sales Bakersfield Terms of Use";
const description =
  "Terms for creating, paying for, publishing and canceling estate sale and yard sale listings.";

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

const sections = [
  [
    "operator",
    "Who operates this website",
    [
      "Estate Sales Bakersfield is operated by Brandon Francis. Contact decoratedbyriley@gmail.com with questions about these terms, a listing or a payment.",
      "These terms cover the directory and self-service listing tools. Professional estate-sale services offered through Simply Decorated are separate and are not included in a listing fee.",
    ],
  ],
  [
    "account",
    "Your account",
    [
      "Use accurate account information, keep your password private and contact us if you believe someone has accessed your account without permission. You may prepare a draft before verifying your email; verification is required before approving and paying to publish an estate sale or yard sale.",
      "Publishing a listing makes your verified account email public so visitors can contact you. Review your contact information and location privacy setting before approval.",
    ],
  ],
  [
    "content",
    "Your listing and photos",
    [
      "You are responsible for accurate sale details, dates, prices, contact information and photos. Publish only content you own or have permission to use, and only advertise sales you are authorized to organize.",
      "Do not submit fraudulent, unlawful, misleading or abusive content, or expose another person's private information without permission. By submitting content, you permit us to store, process, resize and display it to operate and promote your listing on this directory.",
      "We may restrict accounts or remove listings that violate these terms, create a security risk or contain inaccurate or inappropriate information. Listing approval does not verify ownership of every item or guarantee the accuracy of a seller's statements.",
    ],
  ],
  [
    "payment",
    "Approval, fees and publication",
    [
      "Review and approve the exact listing revision before checkout. Material edits require another approval. The price shown at checkout is the listing fee; professional estate-sale services are not included.",
      "Stripe processes checkout when payment is enabled. A browser redirect alone does not establish payment or publication. Your dashboard shows the confirmed publication status. A listing fee does not guarantee attendance, sales, search-engine placement or revenue.",
    ],
  ],
  [
    "cancellation",
    "Cancellation and refunds",
    [
      "You can cancel your published event from your dashboard. Cancellation removes the public listing and schedules uploaded photos for permanent removal. Payment, publication and audit records are retained.",
      "Listing fees are non-refundable, including when you cancel an event, except where a refund is required by applicable law. For a duplicate charge or other payment error, contact support so we can investigate. Canceling a draft before payment does not incur a listing fee.",
    ],
  ],
  [
    "visitors",
    "Visiting a sale and external listings",
    [
      "Confirm sale details with the organizer before traveling. Organizers control their events, merchandise and transactions. Exercise your own judgment when visiting a property or buying an item.",
      "Some listings are attributed to external sources. Their details may change; use the source link to confirm current information. Links to another website do not make that website part of this service.",
    ],
  ],
  [
    "changes",
    "Updates and contact",
    [
      "We may update these terms as the service changes. The updated date appears on this page, and new listing approvals record the terms version shown at approval. Contact decoratedbyriley@gmail.com with questions or to report a problem.",
    ],
  ],
] as const;

export default function TermsPage() {
  return (
    <PublicShell>
      <article className="content-page content-page--legal">
        <header className="content-hero shell-container">
          <p className="eyebrow">Updated September 15, 2026</p>
          <h1>Terms of use</h1>
          <p className="marketing-lede">
            Terms for creating, paying for, publishing and canceling estate sale
            and yard sale listings.
          </p>
        </header>
        <div className="content-legal shell-container">
          {sections.map(([id, heading, paragraphs]) => (
            <section key={id} aria-labelledby={`policy-${id}`}>
              <h2 id={`policy-${id}`}>{heading}</h2>
              {paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
          <p>
            Read our <Link href="/terms">terms of use</Link> and{" "}
            <Link href="/privacy">privacy policy</Link>, or{" "}
            <Link href="/contact">contact support</Link>.
          </p>
        </div>
      </article>
    </PublicShell>
  );
}
