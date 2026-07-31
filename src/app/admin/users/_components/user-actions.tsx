"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Action =
  "restrict" | "restore" | "revoke-sessions" | "resend-verification";

export function UserActions({
  userId,
  name,
  updatedAt,
  capabilities,
}: {
  userId: string;
  name: string;
  updatedAt: string;
  capabilities: {
    resendVerification: boolean;
    restrict: boolean;
    restore: boolean;
    revokeSessions: boolean;
  };
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [action, setAction] = useState<Action>("restrict");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  function open(next: Action) {
    setAction(next);
    setMessage("");
    dialog.current?.showModal();
  }

  async function submit(form: FormData) {
    setPending(true);
    setMessage("");
    try {
      if (action !== "resend-verification") {
        const password = String(form.get("password") ?? "");
        const reauth = await fetch("/api/admin/reauth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        if (!reauth.ok) throw new Error("Password confirmation failed.");
      }
      const body =
        action === "restrict"
          ? {
              reason: String(form.get("reason") ?? ""),
              expectedUpdatedAt: updatedAt,
            }
          : action === "restore"
            ? { expectedUpdatedAt: updatedAt }
            : {};
      const response = await fetch(`/api/admin/users/${userId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error);
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

  const destructive = action === "restrict" || action === "revoke-sessions";
  return (
    <>
      <div className="admin-actions">
        {capabilities.resendVerification ? (
          <button
            className="ui-button ui-button--secondary"
            onClick={() => open("resend-verification")}
          >
            Resend verification
          </button>
        ) : null}
        {capabilities.restrict ? (
          <button
            className="ui-button ui-button--danger"
            onClick={() => open("restrict")}
          >
            Restrict account
          </button>
        ) : null}
        {capabilities.restore ? (
          <button
            className="ui-button ui-button--primary"
            onClick={() => open("restore")}
          >
            Restore account
          </button>
        ) : null}
        {capabilities.revokeSessions ? (
          <button
            className="ui-button ui-button--secondary"
            onClick={() => open("revoke-sessions")}
          >
            Revoke sessions
          </button>
        ) : null}
      </div>
      <dialog
        className="admin-dialog"
        onCancel={() => dialog.current?.close()}
        ref={dialog}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit(new FormData(event.currentTarget));
          }}
        >
          <p className="eyebrow">Confirm account action</p>
          <h2>
            {action === "restrict"
              ? `Restrict ${name}?`
              : action === "restore"
                ? `Restore ${name}?`
                : action === "revoke-sessions"
                  ? `Revoke ${name}’s sessions?`
                  : `Resend verification to ${name}?`}
          </h2>
          {action === "restrict" ? (
            <label className="ui-field">
              <span className="ui-field__label">Restriction reason</span>
              <textarea
                className="ui-input"
                maxLength={500}
                minLength={1}
                name="reason"
                required
              />
            </label>
          ) : null}
          {action !== "resend-verification" ? (
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
              <span className="ui-field__hint">
                Confirms this sensitive owner action for 15 minutes.
              </span>
            </label>
          ) : null}
          {message ? (
            <p className="ui-alert ui-alert--error" role="alert">
              {message}
            </p>
          ) : null}
          <div className="admin-actions">
            <button
              className={
                destructive
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
              disabled={pending}
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
