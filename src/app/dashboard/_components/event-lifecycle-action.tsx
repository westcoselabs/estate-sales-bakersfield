"use client";

import { useRef, useState, type FormEvent } from "react";

import { Icon } from "@/components/ui/icons";

interface EventLifecycleActionProps {
  readonly eventId: string;
  readonly title: string | null;
  readonly expectedVersion: number;
  readonly kind: "delete" | "cancel";
  readonly variant?: "card" | "danger-zone";
  readonly disabledReason?: string | undefined;
}

export function EventLifecycleAction({
  eventId,
  title,
  expectedVersion,
  kind,
  variant = "card",
  disabledReason,
}: EventLifecycleActionProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const phrase = title ?? "DELETE";
  const isFallbackConfirmation = title === null;
  const confirmationMatches = isFallbackConfirmation
    ? confirmation.trim().toUpperCase() === phrase
    : confirmation === phrase;
  const displayTitle = title ?? "Untitled sale";
  const canceling = kind === "cancel";
  const titleId = `${kind}-event-title-${eventId}`;
  const sectionTitleId = `${kind}-event-section-title-${eventId}`;
  const descriptionId = `${kind}-event-description-${eventId}`;
  const disabledDescriptionId = `${kind}-event-disabled-${eventId}`;

  function open() {
    setConfirmation("");
    setError(null);
    dialogRef.current?.showModal();
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function close() {
    if (busy) return;
    dialogRef.current?.close();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmationMatches || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        canceling
          ? `/api/events/${eventId}/cancellation`
          : `/api/events/${eventId}`,
        {
          method: canceling ? "POST" : "DELETE",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ expectedVersion, confirmation }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(
          payload.error ??
            `The event could not be ${canceling ? "canceled" : "deleted"}.`,
        );
        return;
      }
      window.location.assign(
        canceling
          ? "/dashboard/events?view=history&notice=canceled"
          : "/dashboard/events?notice=deleted",
      );
    } catch {
      setError("The request could not be completed. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  const trigger = (
    <button
      type="button"
      className={
        variant === "danger-zone"
          ? "ui-button ui-button--danger"
          : "ui-text-link event-lifecycle-trigger"
      }
      aria-haspopup="dialog"
      aria-disabled={Boolean(disabledReason)}
      aria-describedby={disabledReason ? disabledDescriptionId : undefined}
      title={disabledReason}
      onClick={() => {
        if (!disabledReason) open();
      }}
    >
      <Icon name={canceling ? "pause" : "trash"} size={18} />
      {canceling ? "Cancel event" : "Delete draft"}
    </button>
  );

  return (
    <>
      {variant === "danger-zone" ? (
        <section className="event-danger-zone" aria-labelledby={sectionTitleId}>
          <div>
            <p className="eyebrow">Danger zone</p>
            <h2 id={sectionTitleId}>
              {canceling ? "Cancel this published event" : "Delete this draft"}
            </h2>
            <p id={disabledReason ? disabledDescriptionId : undefined}>
              {disabledReason ??
                (canceling
                  ? "The public listing and photos will be removed. Payment, publication, and audit records remain, and no refund is initiated."
                  : "The draft disappears from your account and its photos are permanently purged. This cannot be undone.")}
            </p>
          </div>
          {trigger}
        </section>
      ) : (
        <>
          {trigger}
          {disabledReason ? (
            <span id={disabledDescriptionId} className="sr-only">
              {disabledReason}
            </span>
          ) : null}
        </>
      )}

      <dialog
        ref={dialogRef}
        className="event-lifecycle-dialog"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        <form onSubmit={submit}>
          <div className="event-lifecycle-dialog__header">
            <span className="event-lifecycle-dialog__icon">
              <Icon name="warning" />
            </span>
            <div>
              <p className="eyebrow">Confirm destructive action</p>
              <h2 id={titleId}>
                {canceling ? "Cancel published event?" : "Delete draft?"}
              </h2>
            </div>
          </div>
          <div id={descriptionId} className="event-lifecycle-dialog__body">
            <p>
              <strong>{displayTitle}</strong>{" "}
              {canceling
                ? "will disappear from public discovery and your main dashboard."
                : "will be removed from your account."}
            </p>
            <div className="warning-box">
              Uploaded photos are permanently purged. Payment, publication, and
              audit records are retained.
              {canceling ? " No refund is initiated." : ""}
            </div>
            <label htmlFor={`${kind}-event-confirmation-${eventId}`}>
              Type <strong>{phrase}</strong> to confirm
              {isFallbackConfirmation
                ? " (capitalization does not matter)"
                : ""}
            </label>
            <input
              ref={inputRef}
              id={`${kind}-event-confirmation-${eventId}`}
              value={confirmation}
              placeholder={isFallbackConfirmation ? "DELETE" : undefined}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(error)}
              onChange={(event) => setConfirmation(event.currentTarget.value)}
            />
            {error ? (
              <p className="form-message form-message--error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <div className="event-lifecycle-dialog__actions">
            <button
              type="button"
              className="ui-button ui-button--secondary"
              disabled={busy}
              onClick={close}
            >
              Keep event
            </button>
            <button
              type="submit"
              className="ui-button ui-button--danger"
              disabled={!confirmationMatches || busy}
            >
              {busy
                ? canceling
                  ? "Canceling…"
                  : "Deleting…"
                : canceling
                  ? "Cancel event"
                  : "Delete draft"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
