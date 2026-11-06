"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ContactAudienceOption } from "@/modules/email";
import { ContactAudiencePicker, audienceKey } from "../contact-audience-picker";
export function CampaignActions({
  campaign,
  contactAudiences,
  dispatchEnabled,
  audience,
  lastErrorCode,
}: {
  contactAudiences: ContactAudienceOption[];
  dispatchEnabled: boolean;
  audience: ContactAudienceOption | null;
  lastErrorCode: string | null;
  campaign: {
    id: string;
    name: string;
    subject: string;
    previewText: string | null;
    status: string;
    version: number;
    testedAt: string | null;
    draftHtml: string | null;
    contactCategory: string | null;
    contactSourceTag: string | null;
  };
}) {
  const router = useRouter();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  useEffect(() => {
    if (!["PREPARING", "READY", "DISPATCHING"].includes(campaign.status))
      return;
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [campaign.status, router]);
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState(campaign.name);
  const [subject, setSubject] = useState(campaign.subject);
  const [previewText, setPreviewText] = useState(campaign.previewText ?? "");
  const [draftHtml, setDraftHtml] = useState(campaign.draftHtml ?? "");
  const [selectedAudienceKey, setSelectedAudienceKey] = useState(
    campaign.contactCategory && campaign.contactSourceTag
      ? audienceKey({
          category: campaign.contactCategory,
          sourceTag: campaign.contactSourceTag,
        })
      : "",
  );
  const selectedAudience = contactAudiences.find(
    (option) => audienceKey(option) === selectedAudienceKey,
  );
  const savedAudienceKey =
    campaign.contactCategory && campaign.contactSourceTag
      ? audienceKey({
          category: campaign.contactCategory,
          sourceTag: campaign.contactSourceTag,
        })
      : "";
  const dirty =
    name !== campaign.name ||
    subject !== campaign.subject ||
    previewText !== (campaign.previewText ?? "") ||
    draftHtml !== (campaign.draftHtml ?? "") ||
    selectedAudienceKey !== savedAudienceKey;
  const canSend =
    dispatchEnabled &&
    Boolean(campaign.testedAt) &&
    !dirty &&
    !pending &&
    (!audience || audience.eligible > 0);
  async function run(
    path: string,
    body: unknown,
    success: string,
    reauth = false,
  ) {
    if (busy.current || dirty) return;
    busy.current = true;
    setPending(true);
    setMessage("Working…");
    try {
      if (reauth) {
        const auth = await fetch("/api/admin/reauth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        setPassword("");
        if (!auth.ok) {
          setMessage("Password confirmation failed. Please try again.");
          return;
        }
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
      setMessage(
        response.ok
          ? path === "send"
            ? `Campaign queued for ${data.recipientCount} eligible recipients. Preparing delivery…`
            : success
          : (data.error ?? "The request could not be completed."),
      );
      if (response.ok) {
        setReviewing(false);
        setConfirmation("");
      }
      router.refresh();
    } catch {
      setMessage(
        "Connection interrupted. Refresh to check the campaign status before trying again.",
      );
      router.refresh();
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <section className="admin-panel campaign-send-panel">
      <div>
        <p className="eyebrow">Final review</p>
        <h2>Review and send</h2>
        <p>
          Review the saved email and audience, then confirm your send. Eligible
          recipients are checked again before delivery.
        </p>
        {campaign.status === "DRAFT" ? (
          <fieldset
            disabled={pending}
            className="campaign-draft-fields"
            style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
          >
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
            {campaign.contactCategory && (
              <ContactAudiencePicker
                options={contactAudiences}
                value={selectedAudienceKey}
                onChange={setSelectedAudienceKey}
              />
            )}
            {campaign.draftHtml !== null && (
              <label className="ui-field">
                <span className="ui-field__label">Email HTML</span>
                <textarea
                  className="ui-input campaign-html-source"
                  value={draftHtml}
                  onChange={(event) => setDraftHtml(event.target.value)}
                  maxLength={250 * 1024}
                  spellCheck={false}
                />
              </label>
            )}
            <button
              className="ui-button ui-button--secondary"
              disabled={Boolean(campaign.contactCategory && !selectedAudience)}
              onClick={async () => {
                if (busy.current) return;
                busy.current = true;
                setPending(true);
                setReviewing(false);
                try {
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
                        ...(campaign.draftHtml !== null ? { draftHtml } : {}),
                        ...(selectedAudience
                          ? {
                              contactCategory: selectedAudience.category,
                              contactSourceTag: selectedAudience.sourceTag,
                            }
                          : {}),
                      }),
                    },
                  );
                  const data = await response.json();
                  setMessage(response.ok ? "Campaign draft saved" : data.error);
                  if (response.ok) router.refresh();
                } catch {
                  setMessage(
                    "Could not save. Check your connection and try again.",
                  );
                } finally {
                  busy.current = false;
                  setPending(false);
                }
              }}
            >
              Save campaign details
            </button>
          </fieldset>
        ) : null}
      </div>
      {campaign.status === "DRAFT" ? (
        <div className="campaign-send-panel__controls">
          <p>
            <strong>
              {audience
                ? `${audience.sourceTag} · ${audience.category === "ATTENDEE" ? "Estate Sale Attendees" : "Business Owners"}`
                : "Registered subscribers"}
            </strong>
          </p>
          {audience && (
            <p>
              {audience.eligible} eligible recipients · {audience.suppressed}{" "}
              excluded
            </p>
          )}
          <p>
            {campaign.testedAt
              ? "Current version tested. Review your inbox before sending."
              : "Send a test of this version before sending to your audience."}
          </p>
          {dirty && (
            <p role="status">Save your changes, then send a new test.</p>
          )}
          {!dispatchEnabled && (
            <p>
              Audience sending is disabled in this environment. Test emails are
              available.
            </p>
          )}
          <button
            className="ui-button ui-button--secondary"
            disabled={pending || dirty}
            onClick={() =>
              run(
                "test",
                {},
                "Test sent to your admin email. Check your inbox before sending.",
              )
            }
          >
            Send owner test
          </button>
          {!reviewing ? (
            <button
              className="ui-button ui-button--primary"
              disabled={!canSend}
              onClick={() => {
                setMessage("");
                setReviewing(true);
              }}
            >
              Review and send
            </button>
          ) : (
            <div className="campaign-draft-fields">
              <h3>Confirm audience send</h3>
              <p>
                Send “{campaign.subject}”
                {audience
                  ? ` to up to ${audience.eligible} eligible contacts in ${audience.sourceTag}`
                  : " to the selected subscribers"}
                . This cannot be undone.
              </p>
              <label className="ui-field">
                <span className="ui-field__label">Admin password</span>
                <input
                  className="ui-input"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  disabled={pending}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <label className="ui-field">
                <span className="ui-field__label">Type SEND</span>
                <input
                  className="ui-input"
                  value={confirmation}
                  disabled={pending}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </label>
              <button
                className="ui-button ui-button--primary"
                disabled={!canSend || confirmation !== "SEND" || !password}
                onClick={() =>
                  run(
                    "send",
                    { expectedVersion: campaign.version, confirmation },
                    "Campaign queued",
                    true,
                  )
                }
              >
                {pending ? "Queuing campaign…" : "Send campaign"}
              </button>
              <button
                className="ui-button ui-button--secondary"
                disabled={pending}
                onClick={() => {
                  setReviewing(false);
                  setMessage("");
                  setPassword("");
                  setConfirmation("");
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      ) : (
        <div role="status">
          <strong>
            Campaign is {campaign.status.toLowerCase().replaceAll("_", " ")}.
          </strong>
          {["PREPARING", "READY", "DISPATCHING"].includes(campaign.status) && (
            <p>
              We’re preparing the audience and submitting your email. This page
              updates automatically; you can safely leave it.
            </p>
          )}
          {campaign.status === "SENT" && (
            <p>
              The email provider accepted the campaign. Delivery results will
              update as they arrive.
            </p>
          )}
          {campaign.status === "NEEDS_REVIEW" && (
            <p>
              The provider result could not be confirmed. Check the broadcast in
              Resend before creating another send.
            </p>
          )}
          {campaign.status === "FAILED" && (
            <p>
              The campaign could not be sent. No automatic resend will occur.
              Review the failure before preparing another campaign.
            </p>
          )}
          {lastErrorCode && <p>Reference: {lastErrorCode}</p>}
        </div>
      )}
      <p aria-live="polite">{message}</p>
    </section>
  );
}
