import Link from "next/link";
import type { ReactNode } from "react";

import { ExternalLink, TextLink } from "@/components/ui/primitives";

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

export function DashboardShell({
  children,
  active = "overview",
}: {
  readonly children: ReactNode;
  readonly active?: "overview" | "organizer";
}) {
  const nav = (
    <>
      <Link
        href="/dashboard"
        aria-current={active === "overview" ? "page" : undefined}
      >
        <span aria-hidden="true">⌂</span> Overview
      </Link>
      <Link
        href="/dashboard/organizer"
        aria-current={active === "organizer" ? "page" : undefined}
      >
        <span aria-hidden="true">◇</span> Organizer
      </Link>
    </>
  );
  return (
    <div className="dashboard-app">
      <SkipLink />
      <aside className="dashboard-sidebar">
        <Brand />
        <nav aria-label="Organizer">{nav}</nav>
        <TextLink href="/">Public site</TextLink>
      </aside>
      <header className="dashboard-topbar">
        <Brand />
        <TextLink href="/">Public site</TextLink>
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
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly meta?: ReactNode;
  readonly backHref?: string;
  readonly backLabel?: string;
  readonly children: ReactNode;
  readonly progress?: ReactNode;
  readonly actions?: ReactNode;
}) {
  return (
    <div className="builder-app">
      <SkipLink />
      <header className="builder-app__header">
        <div className="shell-container builder-app__header-inner">
          <TextLink href={backHref}>← {backLabel}</TextLink>
          <Brand />
          <span className="builder-app__save-region" aria-hidden="true">
            Draft workspace
          </span>
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
