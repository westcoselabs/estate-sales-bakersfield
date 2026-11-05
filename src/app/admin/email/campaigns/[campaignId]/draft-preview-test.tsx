"use client";
import { useRef, useState } from "react";

export function DraftPreviewTest({
  id,
  version,
}: {
  id: string;
  version: number;
}) {
  const [recipient, setRecipient] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const attempt = useRef<string | null>(null);
  const busy = useRef(false);
  return (
    <section className="admin-panel">
      <p className="eyebrow">Inbox preview</p>
      <h2>Send a test email</h2>
      <p>
        Send saved version {version} to one email address. Save any edits first.
        Your attendee audience will not receive this test, and the campaign
        stays a draft.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy.current) return;
          busy.current = true;
          setPending(true);
          setMessage("");
          attempt.current ??= crypto.randomUUID();
          try {
            const response = await fetch(
              `/api/admin/email/campaigns/${id}/preview`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  recipient: recipient.trim(),
                  expectedVersion: version,
                  previewId: attempt.current,
                }),
              },
            );
            const data = await response.json();
            if (!response.ok) {
              setMessage(
                data.error ??
                  "The test could not be confirmed. Check your inbox before retrying.",
              );
              return;
            }
            setMessage(
              `Test submitted to ${data.recipient}. Reference: ${data.providerMessageId}. The campaign remains a draft.`,
            );
            attempt.current = null;
          } catch {
            setMessage(
              "The result could not be confirmed. Check your inbox before retrying; this page will reuse the same test request.",
            );
          } finally {
            busy.current = false;
            setPending(false);
          }
        }}
      >
        <label className="ui-field">
          <span className="ui-field__label">Test recipient email</span>
          <input
            className="ui-input"
            type="email"
            required
            maxLength={254}
            value={recipient}
            disabled={pending}
            onChange={(event) => {
              setRecipient(event.target.value);
              attempt.current = null;
              setMessage("");
            }}
          />
        </label>
        <button
          className="ui-button ui-button--secondary"
          disabled={pending}
          type="submit"
        >
          {pending ? "Sending test…" : "Send test email"}
        </button>
      </form>
      <p role="status">{message}</p>
      <p className="campaign-draft-note">
        Test subjects start with [Test]. The unsubscribe link is a preview
        placeholder.
      </p>
    </section>
  );
}
