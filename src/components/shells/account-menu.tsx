"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { Icon } from "@/components/ui/icons";

export interface ShellAccount {
  readonly displayName: string;
  readonly photoUrl?: string | null;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    parts.length > 1
      ? `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`
      : (parts[0]?.slice(0, 2) ?? "ES")
  ).toUpperCase();
}

export function AccountAvatar({
  account,
  size = "medium",
}: {
  readonly account: ShellAccount;
  readonly size?: "medium" | "large";
}) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <span
      className={`account-avatar account-avatar--${size}`}
      aria-label={`${account.displayName} profile photo`}
      role="img"
    >
      {account.photoUrl && !imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          src={account.photoUrl}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{initials(account.displayName)}</span>
      )}
    </span>
  );
}

export function AccountMenu({ account }: { readonly account: ShellAccount }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const summaryRef = useRef<HTMLElement>(null);

  async function logout() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error("Logout failed");
      window.location.assign("/login");
    } catch {
      setPending(false);
      setError("Unable to log out. Try again.");
    }
  }

  return (
    <details
      className="account-menu"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.currentTarget.open = false;
        summaryRef.current?.focus();
      }}
    >
      <summary
        ref={summaryRef}
        aria-label={`Open account menu for ${account.displayName}`}
      >
        <AccountAvatar account={account} />
        <span className="account-menu__name">{account.displayName}</span>
        <Icon name="chevron" size={18} />
      </summary>
      <div className="account-menu__popover">
        <div className="account-menu__identity">
          <AccountAvatar account={account} size="large" />
          <span>
            <strong>{account.displayName}</strong>
            <small>Organizer account</small>
          </span>
        </div>
        <Link href="/dashboard/profile">
          <Icon name="user" /> Profile
        </Link>
        <Link href="/dashboard/settings">
          <Icon name="settings" /> Settings
        </Link>
        <button type="button" disabled={pending} onClick={() => void logout()}>
          <Icon name="logout" /> {pending ? "Logging out…" : "Log out"}
        </button>
        {error ? (
          <p className="account-menu__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </details>
  );
}
