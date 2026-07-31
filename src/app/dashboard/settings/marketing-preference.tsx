"use client";

import { useState } from "react";

export function MarketingPreference({
  initialSubscribed,
}: {
  initialSubscribed: boolean;
}) {
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function update(next: boolean) {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/marketing-preference", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscribed: next }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error);
      setSubscribed(next);
      setMessage(
        next
          ? "You are subscribed to optional marketing email."
          : "You are unsubscribed from optional marketing email.",
      );
    } catch {
      setMessage("The preference could not be updated. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="settings-panel" aria-labelledby="marketing-title">
      <div>
        <p className="eyebrow">Email preferences</p>
        <h2 id="marketing-title">Optional marketing email</h2>
        <p>
          Choose whether to receive occasional local sale updates and listing
          tips. Account and security email is unaffected.
        </p>
        <button
          className={`ui-button ${subscribed ? "ui-button--secondary" : "ui-button--primary"}`}
          disabled={pending}
          onClick={() => void update(!subscribed)}
          type="button"
        >
          {pending ? "Saving…" : subscribed ? "Unsubscribe" : "Subscribe"}
        </button>
        {message ? (
          <p aria-live="polite" role="status">
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
