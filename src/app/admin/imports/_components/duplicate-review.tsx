"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { useCandidateReviewState } from "./candidate-review-state";
import { ImportStatus, importLabel } from "./import-status";

export interface CandidateDuplicateView {
  readonly id: string;
  readonly resolution: "UNRESOLVED" | "NOT_DUPLICATE" | "LINKED";
  readonly recheckOnly: boolean;
  readonly reasons: readonly string[];
  readonly targetKind: "EVENT" | "EXTERNAL_LISTING";
  readonly targetId: string;
  readonly targetTitle: string;
  readonly targetHref: string;
  readonly linkAvailable: boolean;
}

export function DuplicateReview({
  candidateId,
  version,
  duplicates,
  duplicatesTruncated,
  editable,
  unresolvedDuplicateCount,
}: {
  readonly candidateId: string;
  readonly version: number;
  readonly duplicates: readonly CandidateDuplicateView[];
  readonly duplicatesTruncated: boolean;
  readonly editable: boolean;
  readonly unresolvedDuplicateCount: number;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [selected, setSelected] = useState<CandidateDuplicateView | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [stale, setStale] = useState(false);
  const { dirty, dirtyMessageId } = useCandidateReviewState();

  function close() {
    dialog.current?.close();
  }

  function resetDialog() {
    form.current?.reset();
    setSelected(null);
    setMessage("");
    setStale(false);
  }

  function loadCurrentVersion() {
    close();
    router.refresh();
  }

  async function resolve(
    duplicate: CandidateDuplicateView,
    resolution: "NOT_DUPLICATE" | "LINKED",
    password?: string,
  ) {
    if (dirty) return;
    setPending(true);
    setMessage("");
    setStale(false);
    try {
      if (resolution === "LINKED") {
        const reauthentication = await fetch("/api/admin/reauth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: password ?? "" }),
        });
        if (!reauthentication.ok)
          throw new Error("Password confirmation failed.");
      }
      const response = await fetch(
        `/api/admin/imports/candidates/${candidateId}/duplicates/${duplicate.id}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: version, resolution }),
        },
      );
      const body = (await response.json()) as {
        error?: string;
        code?: string;
      };
      if (!response.ok) {
        setStale(response.status === 409 && body.code === "STALE_VERSION");
        throw new Error(
          body.error ?? "The duplicate decision could not be saved.",
        );
      }
      close();
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The duplicate decision could not be saved.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="admin-panel" aria-labelledby="duplicate-review-title">
      <header>
        <div>
          <p className="eyebrow">Human decisions only</p>
          <h2 id="duplicate-review-title">Probable duplicates</h2>
        </div>
        <span className="admin-section-count">
          {duplicates.length}
          {duplicatesTruncated ? "+" : ""}
        </span>
      </header>
      {duplicates.length ? (
        <ul className="admin-duplicate-list">
          {duplicates.map((duplicate) => (
            <li key={duplicate.id}>
              <div>
                <span className="admin-duplicate-list__kind">
                  {duplicate.targetKind === "EVENT"
                    ? "Organizer listing"
                    : "External listing"}
                </span>
                <Link href={duplicate.targetHref}>{duplicate.targetTitle}</Link>
                <small>{duplicate.reasons.map(importLabel).join(" · ")}</small>
              </div>
              <ImportStatus value={duplicate.resolution} />
              {editable && duplicate.resolution === "UNRESOLVED" ? (
                <div className="admin-actions">
                  <button
                    aria-describedby={dirty ? dirtyMessageId : undefined}
                    className="ui-button ui-button--secondary"
                    disabled={pending || dirty}
                    onClick={() => void resolve(duplicate, "NOT_DUPLICATE")}
                    type="button"
                  >
                    {duplicate.recheckOnly
                      ? "Reconfirm not duplicate"
                      : "Not a duplicate"}
                  </button>
                  {!duplicate.recheckOnly ? (
                    <button
                      aria-describedby={dirty ? dirtyMessageId : undefined}
                      className="ui-button ui-button--primary"
                      disabled={pending || dirty || !duplicate.linkAvailable}
                      onClick={() => {
                        if (dirty) return;
                        setSelected(duplicate);
                        setMessage("");
                        setStale(false);
                        form.current?.reset();
                        dialog.current?.showModal();
                      }}
                      type="button"
                    >
                      Link existing
                    </button>
                  ) : null}
                </div>
              ) : null}
              {editable && duplicate.recheckOnly ? (
                <p className="ui-alert ui-alert--warning">
                  Candidate details changed. Reconfirm this target before
                  approval.
                </p>
              ) : null}
              {editable &&
              !duplicate.linkAvailable &&
              duplicate.resolution === "UNRESOLVED" ? (
                <p className="ui-alert ui-alert--warning">
                  This target is a warning only until it has a current public
                  publication.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>No probable duplicate targets are currently recorded.</p>
      )}
      {duplicatesTruncated ? (
        <p className="ui-alert ui-alert--warning">
          Only the first {duplicates.length} matches are shown. There are{" "}
          {unresolvedDuplicateCount} unresolved matches in total.
        </p>
      ) : null}
      {message ? (
        <div
          className={
            stale ? "ui-alert ui-alert--warning" : "ui-alert ui-alert--error"
          }
          role={stale ? "status" : "alert"}
        >
          <p>{message}</p>
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
      <dialog
        aria-labelledby="duplicate-link-title"
        className="admin-dialog"
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
        onClose={resetDialog}
        ref={dialog}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (selected) {
              void resolve(
                selected,
                "LINKED",
                String(new FormData(event.currentTarget).get("password") ?? ""),
              );
            }
          }}
          ref={form}
        >
          <p className="eyebrow">Terminal duplicate link</p>
          <h2 id="duplicate-link-title">Link to {selected?.targetTitle}?</h2>
          <p>
            Linking retains this import as provenance and prevents creation of
            another public listing. This decision cannot be reversed in v1.
          </p>
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
            <div
              className={
                stale
                  ? "ui-alert ui-alert--warning"
                  : "ui-alert ui-alert--error"
              }
              role={stale ? "status" : "alert"}
            >
              <p>{message}</p>
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
              className="ui-button ui-button--primary"
              disabled={pending || stale || dirty}
            >
              {pending ? "Linking…" : "Confirm link"}
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
    </section>
  );
}
