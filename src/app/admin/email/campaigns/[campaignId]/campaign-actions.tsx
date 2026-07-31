"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function CampaignActions({
  campaign,
}: {
  campaign: {
    id: string;
    name: string;
    subject: string;
    previewText: string | null;
    status: string;
    version: number;
    testedAt: string | null;
  };
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState(campaign.name);
  const [subject, setSubject] = useState(campaign.subject);
  const [previewText, setPreviewText] = useState(campaign.previewText ?? "");
  async function run(
    path: string,
    body: unknown,
    success: string,
    reauth = false,
  ) {
    setMessage("Working…");
    if (reauth) {
      const auth = await fetch("/api/admin/reauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!auth.ok) {
        setMessage("Password confirmation failed.");
        return;
      }
      setPassword("");
    }
    const response = await fetch(
      `/api/admin/email/campaigns/${campaign.id}/${path}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const data = await response.json();
    setMessage(response.ok ? success : data.error);
    if (response.ok) router.refresh();
  }
  return (
    <section className="admin-panel campaign-send-panel">
      <div>
        <p className="eyebrow">Final review</p>
        <h2>Test, confirm, then dispatch</h2>
        <p>
          A fresh audience snapshot is created at send time. Ambiguous provider
          results are never automatically resent.
        </p>
        {campaign.status === "DRAFT" ? (
          <div className="campaign-draft-fields">
            <label className="ui-field">
              <span className="ui-field__label">Campaign name</span>
              <input
                className="ui-input"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="ui-field">
              <span className="ui-field__label">Subject</span>
              <input
                className="ui-input"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              />
            </label>
            <label className="ui-field">
              <span className="ui-field__label">Preview text</span>
              <input
                className="ui-input"
                value={previewText}
                onChange={(event) => setPreviewText(event.target.value)}
              />
            </label>
            <button
              className="ui-button ui-button--secondary"
              onClick={async () => {
                setMessage("Saving…");
                const response = await fetch(
                  `/api/admin/email/campaigns/${campaign.id}`,
                  {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      expectedVersion: campaign.version,
                      name,
                      subject,
                      previewText: previewText || undefined,
                    }),
                  },
                );
                const data = await response.json();
                setMessage(response.ok ? "Campaign draft saved" : data.error);
                if (response.ok) router.refresh();
              }}
            >
              Save campaign details
            </button>
          </div>
        ) : null}
      </div>
      {campaign.status === "DRAFT" ? (
        <div className="campaign-send-panel__controls">
          <button
            className="ui-button ui-button--secondary"
            onClick={() => run("test", {}, "Test sent to your admin email")}
          >
            Send owner test
          </button>
          <label className="ui-field">
            <span className="ui-field__label">Admin password</span>
            <input
              className="ui-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="ui-field">
            <span className="ui-field__label">Type SEND</span>
            <input
              className="ui-input"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
          <button
            className="ui-button ui-button--primary"
            onClick={() =>
              run(
                "send",
                { expectedVersion: campaign.version, confirmation },
                "Campaign queued",
                true,
              )
            }
          >
            Queue campaign
          </button>
        </div>
      ) : (
        <strong>
          Campaign is {campaign.status.toLowerCase().replaceAll("_", " ")}.
        </strong>
      )}
      <p aria-live="polite">{message}</p>
    </section>
  );
}
