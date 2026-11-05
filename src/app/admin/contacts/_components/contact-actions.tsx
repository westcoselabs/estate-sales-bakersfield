"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

async function request(body: unknown) {
  const response = await fetch("/api/admin/contacts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = (await response.json()) as { error?: string };
    throw new Error(error.error ?? "The request failed. Please try again.");
  }
  return response;
}

type Preview = {
  digest: string;
  total: number;
  duplicates: number;
  invalidCount: number;
  counts: { SUBSCRIBED: number; UNSUBSCRIBED: number; CLEANED: number };
  invalid: { row: number; reason: string }[];
  sample: { email: string; status: string }[];
};

export function ContactImport() {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [input, setInput] = useState<unknown>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function review(form: HTMLFormElement) {
    setPending(true);
    setMessage("");
    setPreview(null);
    try {
      const data = new FormData(form);
      const file = data.get("file") as File;
      if (!file?.size || file.size > 500_000)
        throw new Error(
          "Choose a CSV file under 500 KB. Extract ZIP files first.",
        );
      const payload = {
        csv: await file.text(),
        category: data.get("category"),
        sourceTag: data.get("sourceTag"),
        ...(data.get("defaultStatus")
          ? { defaultStatus: data.get("defaultStatus") }
          : {}),
        consentConfirmed: data.get("consent") === "on",
      };
      const response = await request({ action: "preview", input: payload });
      setPreview((await response.json()) as Preview);
      setInput(payload);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function save() {
    if (!preview) return;
    setPending(true);
    setMessage("");
    try {
      const response = await request({
        action: "import",
        input,
        digest: preview.digest,
      });
      const result = (await response.json()) as {
        created: number;
        updated: number;
        suppressed: number;
        alreadyImported: boolean;
      };
      setMessage(
        result.alreadyImported
          ? "This import is already saved. No duplicate contacts were created."
          : `Saved ${result.created} new contacts and updated ${result.updated}. ${result.suppressed} are suppressed. No emails were sent.`,
      );
      setPreview(null);
      setInput(null);
      router.refresh();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="admin-panel contacts-import">
      <summary>Import contacts from CSV</summary>
      <p>
        Up to 5,000 rows / 500 KB. Use email, first_name, last_name and status
        columns, or a Mailchimp CSV. Existing categories are retained and source
        tags are added. Unsubscribed and cleaned contacts stay suppressed.
      </p>
      <form
        onChange={() => {
          setPreview(null);
          setInput(null);
        }}
        onSubmit={(event) => {
          event.preventDefault();
          void review(event.currentTarget);
        }}
      >
        <fieldset disabled={pending} className="contacts-fields">
          <label className="ui-field">
            <span>CSV file</span>
            <input
              className="ui-input"
              name="file"
              type="file"
              accept=".csv,text/csv"
              required
            />
          </label>
          <label className="ui-field">
            <span>Category for new contacts</span>
            <select className="ui-input" name="category">
              <option value="ATTENDEE">Estate Sale Attendees</option>
              <option value="BUSINESS_OWNER">Business Owners</option>
            </select>
          </label>
          <label className="ui-field">
            <span>Partner / source tag</span>
            <input
              className="ui-input"
              name="sourceTag"
              placeholder="e.g. Simply Decorated"
              maxLength={80}
              required
            />
          </label>
          <label className="ui-field">
            <span>If the CSV has no status column</span>
            <select className="ui-input" name="defaultStatus">
              <option value="">Require status in the file</option>
              <option value="SUBSCRIBED">Subscribed audience export</option>
              <option value="UNSUBSCRIBED">Unsubscribed audience export</option>
              <option value="CLEANED">Cleaned / undeliverable export</option>
            </select>
          </label>
          <label className="contacts-permission">
            <input name="consent" type="checkbox" /> I confirm the subscribed
            contacts gave permission to receive promotional email from Estate
            Sales Bakersfield.
          </label>
          <button className="ui-button ui-button--secondary" type="submit">
            {pending ? "Working…" : "Preview import"}
          </button>
        </fieldset>
      </form>
      {preview && (
        <section className="contacts-preview" aria-label="Import preview">
          <h3>{preview.total} unique contacts</h3>
          <p>
            {preview.counts.SUBSCRIBED} subscribed ·{" "}
            {preview.counts.UNSUBSCRIBED} unsubscribed ·{" "}
            {preview.counts.CLEANED} cleaned · {preview.duplicates} duplicate
            rows combined
          </p>
          {preview.invalidCount > 0 && (
            <>
              <p role="alert">
                Fix {preview.invalidCount} invalid rows before importing:
              </p>
              <ul>
                {preview.invalid.map((row) => (
                  <li key={row.row}>
                    Row {row.row}: {row.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
          <ul>
            {preview.sample.map((row) => (
              <li key={row.email}>
                {row.email} — {row.status.toLowerCase()}
              </li>
            ))}
          </ul>
          <button
            className="ui-button ui-button--primary"
            type="button"
            disabled={pending || !!preview.invalidCount || !preview.total}
            onClick={() => void save()}
          >
            Save contacts
          </button>
          <p>This saves contacts only. No emails will be sent or scheduled.</p>
        </section>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  );
}

export function ContactUnsubscribe({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <>
      <button
        className="ui-button ui-button--secondary"
        disabled={pending}
        type="button"
        onClick={async () => {
          if (
            !window.confirm(
              "Unsubscribe this contact from future promotional emails?",
            )
          )
            return;
          setPending(true);
          try {
            await request({ action: "unsubscribe", id });
            router.refresh();
          } catch (error) {
            setMessage((error as Error).message);
          } finally {
            setPending(false);
          }
        }}
      >
        Unsubscribe
      </button>
      {message && <p role="alert">{message}</p>}
    </>
  );
}

export function ContactExport({
  filters,
}: {
  filters: Record<string, unknown>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <>
      <button
        className="ui-button ui-button--secondary"
        type="button"
        onClick={() => dialog.current?.showModal()}
      >
        Export subscribed CSV
      </button>
      <dialog className="admin-dialog" ref={dialog}>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const password = new FormData(form).get("password");
            setPending(true);
            setMessage("");
            try {
              const response = await fetch("/api/admin/reauth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password }),
              });
              if (!response.ok)
                throw new Error("Password confirmation failed.");
              form.reset();
              const exported = await request({
                action: "export",
                input: filters,
              });
              const url = URL.createObjectURL(await exported.blob());
              const link = document.createElement("a");
              link.href = url;
              link.download = "subscribed-contacts.csv";
              link.click();
              URL.revokeObjectURL(url);
              setMessage(
                "Downloaded subscribed contacts matching the search, category and source tag. No emails were sent.",
              );
            } catch (error) {
              setMessage((error as Error).message);
            } finally {
              setPending(false);
            }
          }}
        >
          <h2>Export subscribed contacts</h2>
          <p>
            Exports all subscribed contacts matching your search, category and
            source tag, across every page. Unsubscribed, cleaned and known
            account suppressions are excluded. This does not send email.
          </p>
          <label className="ui-field">
            <span>Your password</span>
            <input
              className="ui-input"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <div className="admin-actions">
            <button
              className="ui-button ui-button--primary"
              type="submit"
              disabled={pending}
            >
              {pending ? "Preparing…" : "Download CSV"}
            </button>
            <button
              className="ui-button ui-button--secondary"
              type="button"
              onClick={() => dialog.current?.close()}
            >
              Close
            </button>
          </div>
          {message && <p role="status">{message}</p>}
        </form>
      </dialog>
    </>
  );
}
