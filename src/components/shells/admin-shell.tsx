"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/ui/icons";

import { AccountMenu, type ShellAccount } from "./account-menu";

function AdminBrand() {
  return (
    <Link
      className="brand"
      href="/admin"
      aria-label="Estate Sales Bakersfield owner overview"
    >
      <picture className="brand__logo">
        <source
          media="(max-width: 767px)"
          srcSet="/images/Logo-gold-black-02.webp"
        />
        <img
          alt=""
          aria-hidden="true"
          className="brand__logo-image"
          height={340}
          src="/images/Logo-gold-black-01.webp"
          width={2000}
        />
      </picture>
    </Link>
  );
}

const destinations: ReadonlyArray<{
  href: string;
  label: string;
  segment: string | null;
  icon: IconName;
}> = [
  { href: "/admin", label: "Overview", segment: null, icon: "home" },
  { href: "/admin/users", label: "Users", segment: "users", icon: "user" },
  {
    href: "/admin/listings",
    label: "Listings",
    segment: "listings",
    icon: "list",
  },
  { href: "/admin/email", label: "Email", segment: "email", icon: "mail" },
  {
    href: "/admin/imports",
    label: "Imports",
    segment: "imports",
    icon: "import",
  },
];

export function AdminShell({
  account,
  children,
}: {
  account: ShellAccount;
  children: ReactNode;
}) {
  const selectedSegment = useSelectedLayoutSegment();
  const navigation = destinations.map((destination) => {
    const active = selectedSegment === destination.segment;
    return (
      <Link
        key={destination.href}
        className="admin-nav-link"
        href={destination.href}
        aria-current={active ? "page" : undefined}
      >
        <Icon name={destination.icon} weight={active ? "fill" : "regular"} />
        <span>{destination.label}</span>
      </Link>
    );
  });

  return (
    <div className="admin-app">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="admin-sidebar">
        <div className="admin-sidebar__brand">
          <AdminBrand />
          <span>Owner control center</span>
        </div>
        <div className="admin-sidebar__identity">
          <span className="admin-sidebar__identity-icon">
            <Icon name="shield" />
          </span>
          <span>
            <small>Secure session</small>
            <strong>Super administrator</strong>
          </span>
        </div>
        <div className="admin-sidebar__navigation">
          <span className="admin-sidebar__label">Workspace</span>
          <nav aria-label="Admin navigation">{navigation}</nav>
        </div>
        <div className="admin-sidebar__secondary">
          <span className="admin-sidebar__label">Website</span>
          <Link href="/" target="_blank" rel="noreferrer">
            <Icon name="external" />
            View website
          </Link>
          <Link href="/dashboard">
            <Icon name="home" />
            Organizer dashboard
          </Link>
          <Link href="/dashboard/settings">
            <Icon name="settings" />
            Admin account
          </Link>
          <AccountMenu account={account} />
        </div>
      </aside>
      <header className="admin-topbar">
        <AdminBrand />
        <div>
          <span>Owner portal</span>
          <AccountMenu account={account} />
        </div>
      </header>
      <main className="admin-main" id="main-content">
        {children}
      </main>
      <nav className="admin-bottom-nav" aria-label="Mobile admin navigation">
        {navigation}
      </nav>
    </div>
  );
}
