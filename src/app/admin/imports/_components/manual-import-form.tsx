"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const MAXIMUM_BODY_BYTES = 1_048_576;

interface ImportResponse {
  readonly batchId?: string;
  readonly error?: string;
}

export function ManualImportForm() {
  const router = useRouter();
  const [format, setFormat] = useState<"json" | "csv">("json");
  const [payload, setPayload] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(form: FormData) {
    setPending(true);
    setMessage("");
    try {
      const reauthentication = await fetch("/api/admin/reauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: String(form.get("password") ?? "") }),
      });
      if (!reauthentication.ok) {
        throw new Error("Password confirmation failed.");
      }

      const body = file ? await file.text() : payload;
      if (!body.trim()) throw new Error("Paste or choose an import file.");
      if (new TextEncoder().encode(body).byteLength > MAXIMUM_BODY_BYTES) {
        throw new Error("The import file exceeds the one-megabyte limit.");
      }
      const response = await fetch("/api/admin/imports/batches", {
        method: "POST",
        headers: {
          "Content-Type": format === "json" ? "application/json" : "text/csv",
        },
        body,
      });
      const result = (await response.json()) as ImportResponse;
      if (!response.ok || !result.batchId) {
        throw new Error(result.error ?? "The import could not be processed.");
      }
      router.push(`/admin/imports/batches/${result.batchId}`);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The import could not be processed.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="admin-panel admin-import-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(new FormData(event.currentTarget));
      }}
    >
      <header>
        <div>
          <p className="eyebrow">Review-only ingestion</p>
          <h2>Choose a local export</h2>
        </div>
      </header>
      <div className="admin-grid--two">
        <label className="ui-field">
          <span className="ui-field__label">Transport format</span>
          <select
            className="ui-input"
            onChange={(event) => {
              setFormat(event.target.value === "csv" ? "csv" : "json");
              setFile(null);
            }}
            value={format}
          >
            <option value="json">listing-import.v1 JSON</option>
            <option value="csv">Fixed-header CSV</option>
          </select>
        </label>
        <label className="ui-field">
          <span className="ui-field__label">Local file (optional)</span>
          <input
            accept={
              format === "json" ? ".json,application/json" : ".csv,text/csv"
            }
            className="ui-input"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            type="file"
          />
        </label>
      </div>
      <label className="ui-field">
        <span className="ui-field__label">
          Or paste {format === "json" ? "the JSON envelope" : "CSV rows"}
        </span>
        <textarea
          className="ui-input admin-import-form__payload"
          onChange={(event) => setPayload(event.target.value)}
          spellCheck={false}
          value={payload}
        />
      </label>
      <label className="ui-field">
        <span className="ui-field__label">Confirm your password</span>
        <input
          autoComplete="current-password"
          className="ui-input"
          maxLength={128}
          name="password"
          required
          type="password"
        />
      </label>
      <p className="ui-alert ui-alert--info">
        Imports create review candidates only. Nothing becomes public until a
        super administrator explicitly approves a confirmed candidate.
      </p>
      {message ? (
        <p className="ui-alert ui-alert--error" role="alert">
          {message}
        </p>
      ) : null}
      <div className="admin-actions">
        <button className="ui-button ui-button--primary" disabled={pending}>
          {pending ? "Importing…" : "Import for review"}
        </button>
      </div>
    </form>
  );
}
