import Link from "next/link";
import type { ReactNode } from "react";

import { ExternalLink, TextLink } from "@/components/ui/primitives";
import { Icon, type IconName } from "@/components/ui/icons";

import { AccountMenu, type ShellAccount } from "./account-menu";

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="Estate Sales Bakersfield home">
      <span className="brand__mark" aria-hidden="true">
        <span />
      </span>
      <span className="brand__type">
        <strong>Estate Sales</strong>
        <small>Bakersfield</small>
      </span>
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

export function PublicShell({ children }: { readonly children: ReactNode }) {
  return (
    <div className="public-shell">
      <SkipLink />
      <header className="public-header">
        <div className="shell-container public-header__inner">
          <Brand />
          <nav className="public-nav public-nav--desktop" aria-label="Primary">
            <TextLink href="/estate-sales">Estate sales</TextLink>
            <TextLink href="/yard-sales">Yard sales</TextLink>
          </nav>
          <div className="public-header__actions">
            <TextLink className="public-login" href="/login">
              Log in
            </TextLink>
            <Link className="ui-button ui-button--accent" href="/signup">
              List your sale
            </Link>
          </div>
          <details className="public-menu">
            <summary aria-label="Open navigation">Menu</summary>
            <nav aria-label="Mobile primary">
              <TextLink href="/estate-sales">Estate sales</TextLink>
              <TextLink href="/yard-sales">Yard sales</TextLink>
              <TextLink href="/login">Log in</TextLink>
              <TextLink href="/signup">List your sale</TextLink>
            </nav>
          </details>
        </div>
      </header>
      <main id="main-content">{children}</main>
      <footer className="public-footer">
        <div className="shell-container public-footer__grid">
          <div>
            <Brand />
            <p>A practical local directory for estate and yard sales.</p>
          </div>
          <nav aria-label="Footer">
            <TextLink href="/estate-sales">Estate sales</TextLink>
            <TextLink href="/yard-sales">Yard sales</TextLink>
            <TextLink href="/signup">List your sale</TextLink>
          </nav>
          <div>
            <p>Need help running an estate sale?</p>
            <ExternalLink href="https://simplydecorated.com/">
              Visit Simply Decorated
            </ExternalLink>
          </div>
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
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
  readonly secondary: ReactNode;
}) {
  return (
    <div className="auth-shell">
      <SkipLink />
      <header className="auth-header shell-container">
        <Brand />
        <TextLink href="/">Back to home</TextLink>
      </header>
      <main id="main-content" className="auth-main">
        <section className="auth-card" aria-labelledby="auth-title">
          <div className="auth-card__intro">
            <p className="eyebrow">{eyebrow}</p>
            <h1 id="auth-title">{title}</h1>
            <p>{description}</p>
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
        <TextLink href="/">Public site</TextLink>
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
      <nav className="dashboard-bottom-nav" aria-label="Organizer mobile">
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
}) {
  return (
    <div className="builder-app">
      <SkipLink />
      <header className="builder-app__header">
        <div className="shell-container builder-app__header-inner">
          <TextLink href={backHref}>← {backLabel}</TextLink>
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
