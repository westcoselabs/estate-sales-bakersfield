"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
type Options = {
  templates: {
    id: string;
    revisionNumber: number;
    template: { name: string };
  }[];
  listings: {
    id: string;
    title: string | null;
    eventType: string;
    startsAt: string;
    location: { city: string } | null;
  }[];
  users: { id: string; displayName: string; email: string }[];
};
export function CampaignComposer({ options }: { options: Options }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [templateRevisionId, setTemplate] = useState(
    options.templates[0]?.id ?? "",
  );
  const [listingIds, setListings] = useState(
    options.listings.slice(0, 3).map((x) => x.id),
  );
  const [selectionMode, setMode] = useState<"ALL_ELIGIBLE" | "SELECTED_USERS">(
    "ALL_ELIGIBLE",
  );
  const [selectedUserIds, setUsers] = useState<string[]>([]);
  const [error, setError] = useState("");
  const previewListings = options.listings.filter((listing) =>
    listingIds.includes(listing.id),
  );
  function toggle(
    values: string[],
    id: string,
    set: (v: string[]) => void,
    max = 10000,
  ) {
    set(
      values.includes(id)
        ? values.filter((v) => v !== id)
        : values.length < max
          ? [...values, id]
          : values,
    );
  }
  async function create() {
    const response = await fetch("/api/admin/email/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        subject,
        previewText: previewText || undefined,
        templateRevisionId,
        listingIds,
        selectionMode,
        selectedUserIds,
      }),
    });
    const data = await response.json();
    if (!response.ok) return setError(data.error);
    router.push(`/admin/email/campaigns/${data.id}`);
  }
  return (
    <div className="campaign-composer-grid">
      <section className="admin-panel campaign-form">
        <p className="eyebrow">Step 1</p>
        <h2>Message</h2>
        <div className="email-form-grid">
          <label className="ui-field">
            <span className="ui-field__label">Internal campaign name</span>
            <input
              className="ui-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="ui-field">
            <span className="ui-field__label">Email subject</span>
            <input
              className="ui-input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>
        </div>
        <label className="ui-field">
          <span className="ui-field__label">Inbox preview text</span>
          <input
            className="ui-input"
            value={previewText}
            onChange={(e) => setPreviewText(e.target.value)}
          />
        </label>
        <label className="ui-field">
          <span className="ui-field__label">Published template</span>
          <select
            className="ui-input"
            value={templateRevisionId}
            onChange={(e) => setTemplate(e.target.value)}
          >
            {options.templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.template.name} · revision {t.revisionNumber}
              </option>
            ))}
          </select>
        </label>
      </section>
      <section className="admin-panel campaign-form">
        <p className="eyebrow">Step 2</p>
        <h2>Featured listings</h2>
        <p>Choose one to six active public listings.</p>
        <div className="campaign-choice-list">
          {options.listings.map((l) => (
            <label key={l.id}>
              <input
                type="checkbox"
                checked={listingIds.includes(l.id)}
                onChange={() => toggle(listingIds, l.id, setListings, 6)}
              />
              <span>
                <strong>{l.title ?? "Untitled sale"}</strong>
                <small>
                  {l.location?.city ?? "Bakersfield"} ·{" "}
                  {new Date(l.startsAt).toLocaleDateString()}
                </small>
              </span>
            </label>
          ))}
        </div>
      </section>
      <section className="admin-panel campaign-form">
        <p className="eyebrow">Step 3</p>
        <h2>Audience</h2>
        <div className="email-audience-toggle">
          <button
            aria-pressed={selectionMode === "ALL_ELIGIBLE"}
            onClick={() => setMode("ALL_ELIGIBLE")}
          >
            All eligible users
          </button>
          <button
            aria-pressed={selectionMode === "SELECTED_USERS"}
            onClick={() => setMode("SELECTED_USERS")}
          >
            Select users
          </button>
        </div>
        <p>
          Active, verified ordinary users who have not unsubscribed. The owner
          and restricted accounts are excluded.
        </p>
        {selectionMode === "SELECTED_USERS" ? (
          <div className="campaign-choice-list campaign-choice-list--users">
            {options.users.map((u) => (
              <label key={u.id}>
                <input
                  type="checkbox"
                  checked={selectedUserIds.includes(u.id)}
                  onChange={() => toggle(selectedUserIds, u.id, setUsers)}
                />
                <span>
                  <strong>{u.displayName}</strong>
                  <small>{u.email}</small>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <div className="campaign-audience-summary">
            <strong>{options.users.length}</strong>
            <span>currently eligible users in preview</span>
          </div>
        )}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="ui-button ui-button--primary" onClick={create}>
          Save campaign draft
        </button>
      </section>
      <section className="admin-panel campaign-live-preview">
        <div className="email-pane-heading">
          <div>
            <strong>Campaign preview</strong>
            <small>Inbox-safe content snapshot</small>
          </div>
          <span className="admin-section-count">
            {selectionMode === "ALL_ELIGIBLE"
              ? `${options.users.length} eligible`
              : `${selectedUserIds.length} selected`}
          </span>
        </div>
        <div className="campaign-preview-email">
          <div className="campaign-preview-email__brand">
            ESTATE SALES <span>BAKERSFIELD</span>
          </div>
          <p className="eyebrow">{previewText || "Recent listings update"}</p>
          <h2>{subject || "Fresh finds near Bakersfield"}</h2>
          <p>Hi there, these recently published sales are ready to explore.</p>
          <div className="campaign-preview-listings">
            {previewListings.map((listing) => (
              <article key={listing.id}>
                <small>{listing.eventType.replaceAll("_", " ")}</small>
                <strong>{listing.title ?? "Untitled sale"}</strong>
                <span>{listing.location?.city ?? "Bakersfield"}</span>
              </article>
            ))}
          </div>
          <a>Unsubscribe</a>
        </div>
      </section>
    </div>
  );
}
