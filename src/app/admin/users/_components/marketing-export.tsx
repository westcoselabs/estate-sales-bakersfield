"use client";

import { useRef, useState } from "react";

export function MarketingExport({ search }: { search: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [count, setCount] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function preview() {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/users/export-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search }),
      });
      const body = (await response.json()) as {
        count?: number;
        exceedsLimit?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error);
      setCount(body.count ?? 0);
      if (body.exceedsLimit) {
        setMessage("More than 10,000 contacts match. Narrow the search.");
      }
      dialog.current?.showModal();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Preview failed.");
    } finally {
      setPending(false);
    }
  }

  async function download(form: FormData) {
    setPending(true);
    setMessage("");
    try {
      const reauth = await fetch("/api/admin/reauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: String(form.get("password") ?? "") }),
      });
      if (!reauth.ok) throw new Error("Password confirmation failed.");
      const response = await fetch("/api/admin/users/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error);
      }
      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "registered-contacts.csv";
      link.click();
      URL.revokeObjectURL(link.href);
      const finalCount = response.headers.get("X-Exported-Record-Count");
      setMessage(`Exported ${finalCount ?? count ?? 0} current contacts.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        className="ui-button ui-button--secondary"
        disabled={pending}
        onClick={() => void preview()}
        type="button"
      >
        {pending ? "Checking…" : "Export contacts"}
      </button>
      {message ? <p role="alert">{message}</p> : null}
      <dialog className="admin-dialog" ref={dialog}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void download(new FormData(event.currentTarget));
          }}
        >
          <p className="eyebrow">Contact export</p>
          <h2>Export {count ?? 0} current contacts?</h2>
          <p>
            Every registered account matching the current search will be checked
            again when the CSV is created.
          </p>
          <label className="ui-field">
            <span className="ui-field__label">Your password</span>
            <input
              autoComplete="current-password"
              className="ui-input"
              name="password"
              required
              type="password"
            />
          </label>
          {message ? <p aria-live="polite">{message}</p> : null}
          <div className="admin-actions">
            <button
              className="ui-button ui-button--primary"
              disabled={pending || (count ?? 0) > 10_000}
              type="submit"
            >
              Download CSV
            </button>
            <button
              className="ui-button ui-button--secondary"
              onClick={() => dialog.current?.close()}
              type="button"
            >
              Close
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
