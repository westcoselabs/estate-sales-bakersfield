"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export interface ExternalListingActionsProps {
  readonly listingId: string;
  readonly title: string;
  readonly version: number;
  readonly canRemove: boolean;
}

interface ApiResponseBody {
  readonly code?: string;
  readonly error?: string;
}

async function responseBody(response: Response): Promise<ApiResponseBody> {
  try {
    return (await response.json()) as ApiResponseBody;
  } catch {
    return {};
  }
}

export function ExternalListingActions({
  listingId,
  title,
  version,
  canRemove,
}: ExternalListingActionsProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [stale, setStale] = useState(false);
  const [resultMessage, setResultMessage] = useState("");

  function open() {
    setDialogError("");
    setStale(false);
    setResultMessage("");
    formRef.current?.reset();
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  function resetDialog() {
    formRef.current?.reset();
    setDialogError("");
    setStale(false);
  }

  function loadCurrentVersion() {
    close();
    router.refresh();
  }

  async function submit(form: FormData) {
    setPending(true);
    setDialogError("");
    setStale(false);
    try {
      const reauthentication = await fetch("/api/admin/reauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: String(form.get("password") ?? ""),
        }),
      });
      if (!reauthentication.ok) {
        const body = await responseBody(reauthentication);
        throw new Error(body.error ?? "Password confirmation failed.");
      }

      const response = await fetch(
        `/api/admin/imports/listings/${listingId}/remove`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedVersion: version,
            reason: String(form.get("reason") ?? ""),
            confirmation: String(form.get("confirmation") ?? ""),
          }),
        },
      );
      const body = await responseBody(response);
      if (!response.ok) {
        const isStale =
          response.status === 409 && body.code === "STALE_VERSION";
        setStale(isStale);
        throw new Error(
          body.error ??
            (isStale
              ? "The listing changed. Load the current version before trying again."
              : "The listing could not be removed."),
        );
      }

      setResultMessage("Listing removed from public discovery.");
      close();
      router.refresh();
    } catch (error) {
      setDialogError(
        error instanceof Error
          ? error.message
          : "The listing could not be removed.",
      );
    } finally {
      setPending(false);
    }
  }

  if (!canRemove) {
    return resultMessage ? (
      <p className="ui-alert ui-alert--success" role="status">
        {resultMessage}
      </p>
    ) : null;
  }

  return (
    <>
      <div className="admin-actions">
        <button
          className="ui-button ui-button--danger"
          disabled={pending}
          onClick={open}
          type="button"
        >
          Remove listing
        </button>
      </div>
      {resultMessage ? (
        <p className="ui-alert ui-alert--success" role="status">
          {resultMessage}
        </p>
      ) : null}
      <dialog
        aria-labelledby="external-listing-remove-title"
        className="admin-dialog"
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
        onClose={resetDialog}
        ref={dialogRef}
      >
        <form
          ref={formRef}
          onSubmit={(event) => {
            event.preventDefault();
            void submit(new FormData(event.currentTarget));
          }}
        >
          <p className="eyebrow">External listing lifecycle</p>
          <h2 id="external-listing-remove-title">Remove {title}?</h2>
          <p className="ui-alert ui-alert--warning">
            Removal is immediate and terminal in version 1. The import
            provenance and audit history remain retained.
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
          <label className="ui-field">
            <span className="ui-field__label">Enter {title} or REMOVE</span>
            <input
              autoComplete="off"
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
          {dialogError ? (
            <div
              className={
                stale
                  ? "ui-alert ui-alert--warning"
                  : "ui-alert ui-alert--error"
              }
              role={stale ? "status" : "alert"}
            >
              <p>{dialogError}</p>
              {stale ? (
                <button
                  className="ui-button ui-button--secondary"
                  onClick={loadCurrentVersion}
                  type="button"
                >
                  Load current version
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="admin-actions">
            <button
              className="ui-button ui-button--danger"
              disabled={pending || stale}
              type="submit"
            >
              {pending ? "Removing…" : "Confirm removal"}
            </button>
            <button
              className="ui-button ui-button--secondary"
              disabled={pending}
              onClick={close}
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
