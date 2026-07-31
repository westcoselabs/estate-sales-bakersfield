"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function ModerationActions({
  eventId,
  title,
  version,
  published,
  canRemove,
  canRestore,
}: {
  eventId: string;
  title: string;
  version: number;
  published: boolean;
  canRemove: boolean;
  canRestore: boolean;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [action, setAction] = useState<"remove" | "restore">("remove");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  function open(next: "remove" | "restore") {
    setAction(next);
    setMessage("");
    dialog.current?.showModal();
  }

  async function submit(form: FormData) {
    setPending(true);
    setMessage("");
    try {
      const reauth = await fetch("/api/admin/reauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: String(form.get("password") ?? "") }),
      });
      if (!reauth.ok) throw new Error("Password confirmation failed.");
      const response = await fetch(`/api/admin/listings/${eventId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: version,
          confirmation: String(form.get("confirmation") ?? ""),
          ...(action === "remove"
            ? { reason: String(form.get("reason") ?? "") }
            : {}),
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error);
      dialog.current?.close();
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The action could not complete.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="admin-actions">
        {canRemove ? (
          <button
            className="ui-button ui-button--danger"
            onClick={() => open("remove")}
          >
            Remove listing
          </button>
        ) : null}
        {canRestore ? (
          <button
            className="ui-button ui-button--primary"
            onClick={() => open("restore")}
          >
            Restore listing
          </button>
        ) : null}
      </div>
      <dialog className="admin-dialog" ref={dialog}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit(new FormData(event.currentTarget));
          }}
        >
          <p className="eyebrow">Listing moderation</p>
          <h2>
            {action === "remove" ? `Remove ${title}?` : `Restore ${title}?`}
          </h2>
          {action === "remove" ? (
            <>
              <p className="ui-alert ui-alert--warning">
                Removal suppresses public, organizer, fulfillment, and uncached
                media access without refunding payment or purging media.
                {!published
                  ? " This unpublished draft cannot be restored through the MVP portal."
                  : ""}
              </p>
              <label className="ui-field">
                <span className="ui-field__label">Removal reason</span>
                <textarea
                  className="ui-input"
                  maxLength={500}
                  minLength={1}
                  name="reason"
                  required
                />
              </label>
            </>
          ) : (
            <p>
              Restoration uses the retained immutable publication, paid and
              fulfilled transaction, ready media, and current organizer status.
            </p>
          )}
          <label className="ui-field">
            <span className="ui-field__label">
              Enter {title} or {action === "remove" ? "REMOVE" : "RESTORE"}
            </span>
            <input
              className="ui-input"
              maxLength={120}
              name="confirmation"
              required
            />
          </label>
          <label className="ui-field">
            <span className="ui-field__label">Your password</span>
            <input
              autoComplete="current-password"
              className="ui-input"
              maxLength={128}
              name="password"
              required
              type="password"
            />
          </label>
          {message ? (
            <p className="ui-alert ui-alert--error" role="alert">
              {message}
            </p>
          ) : null}
          <div className="admin-actions">
            <button
              className={
                action === "remove"
                  ? "ui-button ui-button--danger"
                  : "ui-button ui-button--primary"
              }
              disabled={pending}
              type="submit"
            >
              {pending ? "Working…" : "Confirm"}
            </button>
            <button
              className="ui-button ui-button--secondary"
              onClick={() => dialog.current?.close()}
              type="button"
            >
              Cancel
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
