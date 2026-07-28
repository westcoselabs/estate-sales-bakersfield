import Link from "next/link";
import type { ReactNode } from "react";

import { ExternalLink, TextLink } from "@/components/ui/primitives";
import { Icon, type IconName } from "@/components/ui/icons";
import { getCurrentUser } from "@/modules/auth";

import { AccountMenu, type ShellAccount } from "./account-menu";

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="Estate Sales Bakersfield home">
      <picture className="brand__logo">
        <source media="(max-width: 767px)" srcSet="/images/Logo.svg" />
        <img
          alt=""
          aria-hidden="true"
          className="brand__logo-image"
          height={340}
          src="/images/Logo-01.webp"
          width={2000}
        />
      </picture>
    </Link>
  );
}

export function SkipLink() {
  return (
    <a className="skip-link" href="#main-content">
      Skip to main content
    </a>
  );
}

function PublicListingCta() {
  return (
    <Link
      className="ui-button ui-button--accent public-listing-cta"
      href="/list-your-sale"
    >
      <span>List your sale</span>
      <Icon name="plus" size={18} />
    </Link>
  );
}

function PublicMobileMenu({ home = false }: { readonly home?: boolean }) {
  return (
    <details className="public-menu">
      <summary aria-label="Open navigation">
        <Icon name="menu" size={22} />
      </summary>
      <nav aria-label="Mobile primary">
        <TextLink href="/search">{home ? "Explore" : "Find sales"}</TextLink>
        <TextLink href="/how-it-works">How it works</TextLink>
        <TextLink href="/about">About</TextLink>
        <TextLink href="/faq">FAQs</TextLink>
        <TextLink href="/list-your-sale">List your sale</TextLink>
      </nav>
    </details>
  );
}

export async function PublicShell({
  children,
  variant = "default",
}: {
  readonly children: ReactNode;
  readonly variant?: "default" | "home";
}) {
  const home = variant === "home";
  const currentUser = await getCurrentUser();
  const account: ShellAccount | null = currentUser
    ? { displayName: currentUser.displayName }
    : null;

  return (
    <div className={`public-shell${home ? " public-shell--home" : ""}`}>
      <SkipLink />
      <header className="public-header">
        <div className="shell-container public-header__inner">
          <Brand />
          <nav className="public-nav public-nav--desktop" aria-label="Primary">
            <TextLink href="/search">
              {home ? "Explore" : "Find sales"}
            </TextLink>
            <TextLink href="/how-it-works">How it works</TextLink>
            <TextLink href="/about">About</TextLink>
            {!home ? <TextLink href="/faq">FAQs</TextLink> : null}
          </nav>
          <div className="public-header__actions">
            {!home ? <PublicListingCta /> : null}
            {!account ? (
              <TextLink
                className="public-login public-login--button"
                href="/login"
              >
                Log in
              </TextLink>
            ) : null}
            {account ? (
              <AccountMenu account={account} variant="public" />
            ) : null}
            {home ? <PublicListingCta /> : null}
          </div>
          <div className="public-header__mobile-actions">
            {!account ? (
              <>
                <TextLink
                  className="public-login public-login--button"
                  href="/login"
                >
                  Log in
                </TextLink>
                <PublicMobileMenu home={home} />
              </>
            ) : (
              <>
                <AccountMenu account={account} variant="public" />
                <PublicMobileMenu home={home} />
              </>
            )}
          </div>
        </div>
      </header>
      <main id="main-content">{children}</main>
      <footer className="public-footer">
        <div className="shell-container public-footer__grid">
          <div className="public-footer__brand">
            <Brand />
            <p>
              A local marketplace for discovering published estate and yard sale
              listings in Bakersfield.
            </p>
          </div>
          <nav aria-label="Explore">
            <strong>Explore</strong>
            <TextLink href="/search">All sales</TextLink>
            <TextLink href="/estate-sales">Estate sales</TextLink>
            <TextLink href="/yard-sales">Yard sales</TextLink>
          </nav>
          <nav aria-label="For sellers">
            <strong>For sellers</strong>
            <TextLink href="/list-your-sale">List your sale</TextLink>
            <TextLink href="/how-it-works">How it works</TextLink>
            <TextLink href="/faq">FAQ</TextLink>
          </nav>
          <nav aria-label="Company and support">
            <strong>Company</strong>
            <TextLink href="/about">About</TextLink>
            <TextLink href="/contact">Contact</TextLink>
            <TextLink href="/privacy">Privacy</TextLink>
            <TextLink href="/terms">Terms</TextLink>
          </nav>
          <div className="public-footer__service">
            <strong>Need hands-on help?</strong>
            <p>
              Simply Decorated offers separate organizing, pricing, staging, and
              promotion services.
            </p>
            <ExternalLink href="https://decoratedbyriley.com/estate-sale-companies-bakersfield/">
              Explore professional estate-sale services
              <Icon name="external" size={17} />
              <span className="sr-only">(opens in a new tab)</span>
            </ExternalLink>
          </div>
        </div>
        <div className="shell-container public-footer__legal">
          <p>Estate Sales Bakersfield is a self-service listing marketplace.</p>
          <p>&copy; {new Date().getFullYear()} Estate Sales Bakersfield</p>
        </div>
      </footer>
    </div>
  );
}

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  secondary,
  className = "",
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
  readonly secondary: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={`auth-shell ${className}`.trim()}>
      <SkipLink />
      <header className="auth-header shell-container">
        <Brand />
        <TextLink href="/">Back to home</TextLink>
      </header>
      <main id="main-content" className="auth-main">
        <section className="auth-card" aria-labelledby="auth-title">
          <div className="auth-card__intro">
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            <h1 id="auth-title">{title}</h1>
            {description ? <p>{description}</p> : null}
          </div>
          {children}
          <div className="auth-card__secondary">{secondary}</div>
        </section>
        <aside className="auth-trust" aria-label="Why list here">
          <p className="eyebrow">Local, clear, trustworthy</p>
          <h2>Prepare your sale with confidence.</h2>
          <ul>
            <li>Build a draft before you publish.</li>
            <li>Keep sensitive location details under your control.</li>
            <li>Review the exact listing before payment.</li>
          </ul>
        </aside>
      </main>
    </div>
  );
}

type DashboardDestination =
  "overview" | "listings" | "create" | "profile" | "settings";

export function DashboardShell({
  children,
  active = "overview",
  account,
}: {
  readonly children: ReactNode;
  readonly active?: DashboardDestination;
  readonly account?: ShellAccount;
}) {
  const destinations: ReadonlyArray<{
    href: string;
    label: string;
    key: DashboardDestination;
    icon: IconName;
  }> = [
    { href: "/dashboard", label: "Overview", key: "overview", icon: "home" },
    {
      href: "/dashboard/events",
      label: "Listings",
      key: "listings",
      icon: "list",
    },
    {
      href: "/dashboard/events/new",
      label: "Create",
      key: "create",
      icon: "plus",
    },
  ];
  const nav = destinations.map((destination) => (
    <Link
      key={destination.key}
      className={`dashboard-nav-link dashboard-nav-link--${destination.key}`}
      href={destination.href}
      aria-current={active === destination.key ? "page" : undefined}
    >
      <Icon
        name={destination.icon}
        weight={active === destination.key ? "fill" : "regular"}
      />
      <span>{destination.label}</span>
    </Link>
  ));
  return (
    <div className="dashboard-app">
      <SkipLink />
      <aside className="dashboard-sidebar">
        <Brand />
        <nav aria-label="Organizer dashboard">{nav}</nav>
        <TextLink
          className="dashboard-exit-link"
          href="/"
          aria-label="Exit dashboard to public site"
        >
          <Icon name="logout" size={19} />
          <span>Exit</span>
        </TextLink>
      </aside>
      <header className="dashboard-topbar">
        <Brand />
        {account ? (
          <AccountMenu account={account} />
        ) : (
          <TextLink href="/">Public site</TextLink>
        )}
      </header>
      <main id="main-content" className="dashboard-main">
        {children}
      </main>
      <nav
        className="dashboard-bottom-nav"
        aria-label="Organizer mobile"
        data-active={active}
      >
        {nav}
      </nav>
    </div>
  );
}

export function BuilderShell({
  eyebrow,
  title,
  meta,
  backHref = "/dashboard",
  backLabel = "Back to dashboard",
  children,
  progress,
  actions,
  account,
  className = "",
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly meta?: ReactNode;
  readonly backHref?: string;
  readonly backLabel?: string;
  readonly children: ReactNode;
  readonly progress?: ReactNode;
  readonly actions?: ReactNode;
  readonly account?: ShellAccount;
  readonly className?: string;
}) {
  return (
    <div className={`builder-app ${className}`.trim()}>
      <SkipLink />
      <header className="builder-app__header">
        <div className="shell-container builder-app__header-inner">
          <TextLink
            className="builder-back-link"
            href={backHref}
            aria-label={backLabel}
          >
            <span className="builder-back-link__icon" aria-hidden="true">
              <Icon name="arrow" size={18} />
            </span>
            <span>Back</span>
          </TextLink>
          <Brand />
          {account ? (
            <AccountMenu account={account} />
          ) : (
            <span className="builder-app__save-region" aria-hidden="true">
              Draft workspace
            </span>
          )}
        </div>
      </header>
      <main id="main-content" className="builder-app__main shell-container">
        <header className="builder-page-heading">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          {meta ? <div>{meta}</div> : null}
        </header>
        {progress ? (
          <div className="builder-progress-region">{progress}</div>
        ) : null}
        {children}
      </main>
      {actions ? <div className="builder-action-region">{actions}</div> : null}
    </div>
  );
}
