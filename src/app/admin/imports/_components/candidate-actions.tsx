"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { useCandidateReviewState } from "./candidate-review-state";

type ReviewAction = "approve" | "reject" | "delete";

export function CandidateActions({
  candidateId,
  title,
  version,
  approvalBlockedReason,
}: {
  readonly candidateId: string;
  readonly title: string;
  readonly version: number;
  readonly approvalBlockedReason?: string;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [action, setAction] = useState<ReviewAction>("approve");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [stale, setStale] = useState(false);
  const { dirty, dirtyMessageId } = useCandidateReviewState();

  function open(next: ReviewAction) {
    if (dirty) return;
    setAction(next);
    setMessage("");
    setStale(false);
    form.current?.reset();
    dialog.current?.showModal();
  }

  function close() {
    dialog.current?.close();
  }

  function resetDialog() {
    form.current?.reset();
    setMessage("");
    setStale(false);
  }

  function loadCurrentVersion() {
    close();
    router.refresh();
  }

  async function recompute() {
    if (dirty) return;
    setPending(true);
    setMessage("");
    setStale(false);
    try {
      const response = await fetch(
        `/api/admin/imports/candidates/${candidateId}/duplicates/recompute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: version }),
        },
      );
      const body = (await response.json()) as {
        error?: string;
        code?: string;
      };
      if (!response.ok) {
        setStale(response.status === 409 && body.code === "STALE_VERSION");
        throw new Error(body.error ?? "Duplicates could not be refreshed.");
      }
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Duplicates could not be refreshed.",
      );
    } finally {
      setPending(false);
    }
  }

  async function submit(form: FormData) {
    if (dirty) return;
    setPending(true);
    setMessage("");
    setStale(false);
    try {
      const reauthentication = await fetch("/api/admin/reauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: String(form.get("password") ?? "") }),
      });
      if (!reauthentication.ok)
        throw new Error("Password confirmation failed.");
      const response = await fetch(
        `/api/admin/imports/candidates/${candidateId}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedVersion: version,
            ...(action === "approve"
              ? {}
              : {
                  reason: String(form.get("reason") ?? ""),
                  ...(action === "delete"
                    ? {
                        confirmation: String(form.get("confirmation") ?? ""),
                      }
                    : {}),
                }),
          }),
        },
      );
      const body = (await response.json()) as {
        readonly code?: string;
        readonly error?: string;
        readonly listingId?: string;
      };
      if (!response.ok) {
        setStale(response.status === 409 && body.code === "STALE_VERSION");
        throw new Error(body.error ?? "The review action could not complete.");
      }
      close();
      if (body.listingId)
        router.push(`/admin/imports/listings/${body.listingId}`);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The review action could not complete.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="admin-actions">
        <button
          aria-describedby={
            dirty
              ? dirtyMessageId
              : approvalBlockedReason
                ? "candidate-approval-blocked-reason"
                : undefined
          }
          className="ui-button ui-button--primary"
          disabled={pending || dirty || Boolean(approvalBlockedReason)}
          onClick={() => open("approve")}
          type="button"
        >
          Approve listing
        </button>
        <button
          aria-describedby={dirty ? dirtyMessageId : undefined}
          className="ui-button ui-button--secondary"
          disabled={pending || dirty}
          onClick={() => void recompute()}
          type="button"
        >
          Refresh duplicates
        </button>
        <button
          aria-describedby={dirty ? dirtyMessageId : undefined}
          className="ui-button ui-button--secondary"
          disabled={pending || dirty}
          onClick={() => open("reject")}
          type="button"
        >
          Reject
        </button>
        <button
          aria-describedby={dirty ? dirtyMessageId : undefined}
          className="ui-button ui-button--danger"
          disabled={pending || dirty}
          onClick={() => open("delete")}
          type="button"
        >
          Delete candidate
        </button>
      </div>
      {approvalBlockedReason ? (
        <p
          className="ui-alert ui-alert--warning"
          id="candidate-approval-blocked-reason"
        >
          {approvalBlockedReason}
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
        aria-labelledby="candidate-review-action-title"
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
            void submit(new FormData(event.currentTarget));
          }}
          ref={form}
        >
          <p className="eyebrow">Candidate review</p>
          <h2 id="candidate-review-action-title">
            {action === "approve"
              ? `Approve ${title}?`
              : action === "reject"
                ? `Reject ${title}?`
                : `Delete ${title}?`}
          </h2>
          <p>
            {action === "approve"
              ? "Approval rechecks content, location, duplicate decisions, and public-ID reservation in one transaction."
              : "This candidate state is terminal in version 1; provenance and import observations remain retained."}
          </p>
          {action !== "approve" ? (
            <label className="ui-field">
              <span className="ui-field__label">Reason</span>
              <textarea
                className="ui-input"
                maxLength={500}
                minLength={1}
                name="reason"
                required
              />
            </label>
          ) : null}
          {action === "delete" ? (
            <label className="ui-field">
              <span className="ui-field__label">
                Type DELETE or the full candidate title
              </span>
              <input
                autoComplete="off"
                className="ui-input"
                maxLength={120}
                name="confirmation"
                required
              />
            </label>
          ) : null}
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
              className={
                action === "delete"
                  ? "ui-button ui-button--danger"
                  : "ui-button ui-button--primary"
              }
              disabled={pending || stale || dirty}
            >
              {pending ? "Working…" : "Confirm"}
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
