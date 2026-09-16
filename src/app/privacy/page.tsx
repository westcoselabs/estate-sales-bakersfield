import type { Metadata } from "next";
import Link from "next/link";

import { PublicShell } from "@/components/shells/shells";

const title = "Estate Sales Bakersfield Privacy Policy";
const description =
  "How Estate Sales Bakersfield collects and uses account, listing, photo, payment and location information.";

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

const sections = [
  [
    "operator",
    "Who is responsible",
    [
      "Estate Sales Bakersfield is responsible for this website. For privacy questions or requests, contact decoratedbyriley@gmail.com.",
    ],
  ],
  [
    "collection",
    "Information we collect",
    [
      "Account information includes your name, email, password hash, verification status and optional profile or business information. We also store marketing preferences and records needed to secure your account.",
      "Listing information includes your sale type, title, description, schedule, selected address, coordinates, location privacy choice and uploaded photos. Payment records include checkout references, amounts, status and publication history. Stripe handles card details; this application does not store complete card numbers.",
      "Technical information includes session cookies, request and security records, browser/device information and delivery or error diagnostics. Hosting and service providers may receive your IP address when serving the website, maps or other requested resources.",
    ],
  ],
  [
    "use",
    "How we use information",
    [
      "We use this information to authenticate accounts, verify email, create and publish listings, process and reconcile checkout, deliver account and receipt emails, prevent abuse, investigate support requests and maintain the service.",
      "Marketing email requires a recorded opt-in. You can change that preference in account settings or use an unsubscribe link. Unsubscribing from marketing does not prevent necessary account, security or transaction messages.",
    ],
  ],
  [
    "public",
    "What becomes public",
    [
      "Your published listing shows the approved sale information, authorized photos and verified account email. Optional business name and website information appear when provided. Profile phone details remain private.",
      "Choose an exact address, approximate location or an address hidden until the sale starts. Approximate and hidden modes omit private street and exact-coordinate information from public results. Content you type into a description or include in a photo can itself reveal an address; review it before publishing.",
      "Public pages can be copied, indexed or retained by visitors and search engines. Canceling a listing removes it from this directory, but cannot remove copies held independently by others.",
    ],
  ],
  [
    "providers",
    "Service providers",
    [
      "Vercel hosts the application and stores listing media in Blob. Neon/PostgreSQL stores application records. Resend delivers account and transaction messages and processes email delivery and subscription events. Stripe processes checkout and returns payment status.",
      "Geoapify processes address suggestions through our server; confirmed addresses and coordinates are stored for the listing. MapLibre displays maps using OpenFreeMap and OpenStreetMap-derived data. Map requests go to the map providers.",
      "When configured, Sentry receives filtered error diagnostics to help identify failures. The application disables default personal-information collection and filters sensitive fields; service-provider network logs may still contain technical information.",
      "We use Google Analytics to understand visits to public pages. Analytics uses cookies and receives technical browser and device information. Our pageview integration omits URL query strings and fragments and excludes account, login, administration and checkout pages. We do not send account email addresses or payment details as analytics parameters, and Google advertising signals and advertising personalization are disabled in our tag configuration.",
      "These providers process information needed for their services. We may also disclose information when required by law or necessary to investigate fraud, protect the service or respond to a legitimate security incident.",
    ],
  ],
  [
    "cookies",
    "Cookies and browser signals",
    [
      "We use an essential session cookie to keep you signed in and protect authenticated actions. You can sign out or clear browser cookies; blocking the session cookie prevents sign-in features from working.",
      "The application does not currently implement advertising pixels or cross-site behavioral advertising. It does not change its behavior in response to browser Do Not Track signals. Third-party services receive technical information when their resources are requested and operate under their own privacy policies.",
    ],
  ],
  [
    "retention",
    "Retention and deletion",
    [
      "Account, listing, payment, publication and security records may remain after an event ends or is canceled. Cancellation is not an account-deletion request. Uploaded photos are scheduled for removal under the listing lifecycle; background processing and retries can delay physical deletion.",
      "There is currently no single automatic deletion period for all retained records. We review deletion requests while considering account operation, payment history, security, disputes and applicable recordkeeping requirements. Backup copies can remain until the backup retention period expires.",
    ],
  ],
  [
    "choices",
    "Your choices and requests",
    [
      "You can update available profile and marketing settings in your account, edit eligible drafts and cancel published events. Contact decoratedbyriley@gmail.com to request access, correction or deletion of other personal information. We may need to verify your identity before acting; do not email passwords, authentication codes or complete payment-card details.",
      "The directory is intended for people organizing or finding local sales. If you believe a child has submitted personal information without appropriate permission, contact us so we can investigate and take appropriate action.",
    ],
  ],
  [
    "changes",
    "Policy updates",
    [
      "We post changes to this policy on this page and update the date. Material changes will be identified in a notice on this page. Contact decoratedbyriley@gmail.com if you have questions about an update.",
    ],
  ],
] as const;

export default function PrivacyPage() {
  return (
    <PublicShell>
      <article className="content-page content-page--legal">
        <header className="content-hero shell-container">
          <p className="eyebrow">Updated September 15, 2026</p>
          <h1>Privacy policy</h1>
          <p className="marketing-lede">
            How Estate Sales Bakersfield collects and uses account, listing,
            photo, payment and location information.
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
