import type { Metadata } from "next";
import Link from "next/link";

import { PublicShell } from "@/components/shells/shells";
import { Icon } from "@/components/ui/icons";
import { ExternalLink } from "@/components/ui/primitives";

const title = "Estate Sales Bakersfield FAQ";
const description =
  "Answers about finding local sales, location privacy, creating a listing, approval, payment, and publication.";

const questions = [
  {
    question: "What kinds of sales can I find here?",
    answer:
      "The current marketplace supports estate sales and yard sales. Public results come from paid, published listings that remain eligible for the upcoming search.",
  },
  {
    question: "How does This Weekend work?",
    answer:
      "This Weekend uses America/Los_Angeles time. Monday through Thursday selects the upcoming Friday through Sunday. Friday selects Friday through Sunday. Saturday selects Saturday through Sunday. Sunday selects Sunday only.",
  },
  {
    question: "Why is a street address not always visible?",
    answer:
      "An organizer chooses an exact address, an approximate location, or a location hidden until the sale starts. Public cards, details, and map behavior must honor that choice.",
  },
  {
    question: "How do I create a listing?",
    answer:
      "Create an account, verify your email, complete the required organizer profile, and work through Details, Schedule, Address and privacy, Photos, then Review and payment.",
  },
  {
    question: "When can I upload photos?",
    answer:
      "Photo actions require a verified email and the required workflow state. A photo is treated as saved only after the server confirms it, and the listing needs a selected cover before review.",
  },
  {
    question: "What happens if I edit an approved listing?",
    answer:
      "A material change creates a new listing revision. The new revision must be previewed and approved again before it can proceed through the existing payment and publication rules.",
  },
  {
    question: "When do I pay?",
    answer:
      "Payment is available after the current listing revision is complete and approved. A checkout return alone does not confirm publication. The dashboard shows the authoritative payment and publication status.",
  },
  {
    question: "Does the listing fee include professional estate-sale services?",
    answer:
      "No. The platform listing workflow and Simply Decorated professional estate-sale services are separate. Professional help with organizing, pricing, staging, and promotion is not included in platform checkout.",
  },
] as const;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/faq" },
  openGraph: {
    title,
    description,
    type: "website",
    url: "/faq",
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

export default function FaqPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: {
        "@type": "Answer",
        text: answer,
      },
    })),
  };

  return (
    <PublicShell>
      <div className="content-page">
        <header className="content-hero shell-container">
          <p className="eyebrow">Common questions</p>
          <h1>Estate Sales Bakersfield FAQ</h1>
          <p className="marketing-lede">
            Straight answers about public sale discovery and the real organizer
            workflow.
          </p>
        </header>

        <section
          className="content-section shell-container"
          aria-labelledby="faq-list-title"
        >
          <h2 id="faq-list-title" className="sr-only">
            Questions and answers
          </h2>
          <div className="content-faq">
            {questions.map(({ question, answer }) => (
              <details key={question} className="content-faq__item">
                <summary>
                  <span>{question}</span>
                  <Icon name="plus" size={19} />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section
          className="marketing-section shell-container"
          aria-labelledby="faq-next-title"
        >
          <div className="marketing-card marketing-card--wide">
            <div>
              <p className="eyebrow">Need another next step?</p>
              <h2 id="faq-next-title">Choose the path that fits your need.</h2>
              <div className="marketing-actions">
                <Link className="ui-button ui-button--primary" href="/search">
                  Browse upcoming sales
                </Link>
                <Link
                  className="ui-button ui-button--accent"
                  href="/list-your-sale"
                >
                  Learn about self-service listing
                </Link>
                <Link className="ui-text-link" href="/contact">
                  View support options
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section
          className="marketing-section shell-container"
          aria-labelledby="faq-service-title"
        >
          <div className="service-cta">
            <div>
              <p className="eyebrow">A separate professional service</p>
              <h2 id="faq-service-title">
                Need hands-on help with your estate sale?
              </h2>
              <p>
                Explore professional help with organizing, pricing, staging, and
                promoting a sale through Simply Decorated.
              </p>
            </div>
            <ExternalLink
              className="ui-button ui-button--secondary service-cta__link"
              href="https://decoratedbyriley.com/estate-sale-companies-bakersfield/"
              aria-label="Explore Simply Decorated estate-sale services, opens in a new tab"
            >
              <span>Explore Simply Decorated estate-sale services</span>
              <Icon name="external" size={18} />
            </ExternalLink>
          </div>
        </section>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
          }}
        />
      </div>
    </PublicShell>
  );
}
