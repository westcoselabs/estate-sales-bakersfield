"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import {
  CANDIDATE_DIRTY_MESSAGE,
  useCandidateReviewState,
} from "./candidate-review-state";

export interface CandidateReviewContent {
  readonly eventType: "ESTATE_SALE" | "YARD_SALE";
  readonly title: string;
  readonly description: string;
  readonly localStartsAt: string;
  readonly localEndsAt: string;
  readonly timezone: string;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string;
  readonly countryCode: string;
  readonly privacyMode: "APPROXIMATE_LOCATION" | "EXACT_ADDRESS";
}

function contentFrom(form: FormData): CandidateReviewContent {
  const optional = (name: string) => {
    const value = String(form.get(name) ?? "").trim();
    return value || null;
  };
  return {
    eventType:
      form.get("eventType") === "YARD_SALE" ? "YARD_SALE" : "ESTATE_SALE",
    title: String(form.get("title") ?? ""),
    description: String(form.get("description") ?? ""),
    localStartsAt: String(form.get("localStartsAt") ?? ""),
    localEndsAt: String(form.get("localEndsAt") ?? ""),
    timezone: String(form.get("timezone") ?? ""),
    addressLine1: optional("addressLine1"),
    addressLine2: optional("addressLine2"),
    city: String(form.get("city") ?? ""),
    region: String(form.get("region") ?? ""),
    postalCode: String(form.get("postalCode") ?? ""),
    countryCode: String(form.get("countryCode") ?? ""),
    privacyMode:
      form.get("privacyMode") === "EXACT_ADDRESS"
        ? "EXACT_ADDRESS"
        : "APPROXIMATE_LOCATION",
  };
}

export function CandidateEditor({
  candidateId,
  version,
  content,
  locationConfirmed,
}: {
  readonly candidateId: string;
  readonly version: number;
  readonly content: CandidateReviewContent;
  readonly locationConfirmed: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [pending, setPending] = useState<"save" | "location" | null>(null);
  const [message, setMessage] = useState("");
  const [stale, setStale] = useState(false);
  const [discardStatus, setDiscardStatus] = useState("");
  const { dirty, dirtyMessageId, setDirty } = useCandidateReviewState();

  async function mutate(action: "save" | "location") {
    if (!formRef.current) return;
    if ((action === "save" && !dirty) || (action === "location" && dirty)) {
      return;
    }
    setPending(action);
    setMessage("");
    setDiscardStatus("");
    setStale(false);
    try {
      const data = contentFrom(new FormData(formRef.current));
      const response = await fetch(
        action === "save"
          ? `/api/admin/imports/candidates/${candidateId}`
          : `/api/admin/imports/candidates/${candidateId}/location`,
        {
          method: action === "save" ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            action === "save"
              ? { expectedVersion: version, ...data }
              : { expectedVersion: version },
          ),
        },
      );
      const body = (await response.json()) as { error?: string; code?: string };
      if (!response.ok) {
        setStale(response.status === 409 && body.code === "STALE_VERSION");
        throw new Error(body.error ?? "The candidate could not be updated.");
      }
      setMessage(
        action === "save"
          ? "Candidate changes saved. Duplicate warnings were refreshed."
          : "The saved address was confirmed by the configured location provider.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The candidate could not be updated.",
      );
    } finally {
      setPending(null);
    }
  }

  function discard() {
    if (pending !== null) return;
    formRef.current?.reset();
    setMessage("");
    setStale(false);
    setDirty(false);
    setDiscardStatus("Persisted candidate values restored.");
    headingRef.current?.focus();
  }

  return (
    <form
      className="admin-panel admin-review-form"
      onChange={() => {
        setDiscardStatus("");
        setDirty(true);
      }}
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        void mutate("save");
      }}
    >
      <header>
        <div>
          <p className="eyebrow">Public-facing draft</p>
          <h2 ref={headingRef} tabIndex={-1}>
            Edit candidate
          </h2>
        </div>
        <span
          className={
            locationConfirmed
              ? "admin-status admin-status--success"
              : "admin-status admin-status--warning"
          }
        >
          {locationConfirmed ? "Location confirmed" : "Location required"}
        </span>
      </header>

      <div className="admin-review-form__grid">
        <label className="ui-field">
          <span className="ui-field__label">Sale type</span>
          <select
            className="ui-input"
            defaultValue={content.eventType}
            name="eventType"
          >
            <option value="ESTATE_SALE">Estate sale</option>
            <option value="YARD_SALE">Yard sale</option>
          </select>
        </label>
        <label className="ui-field admin-review-form__wide">
          <span className="ui-field__label">Title</span>
          <input
            className="ui-input"
            defaultValue={content.title}
            maxLength={120}
            minLength={3}
            name="title"
            required
          />
        </label>
        <label className="ui-field admin-review-form__wide">
          <span className="ui-field__label">Description</span>
          <textarea
            className="ui-input"
            defaultValue={content.description}
            maxLength={5000}
            minLength={20}
            name="description"
            required
          />
        </label>
        <label className="ui-field">
          <span className="ui-field__label">Starts</span>
          <input
            className="ui-input"
            defaultValue={content.localStartsAt}
            name="localStartsAt"
            required
            type="datetime-local"
          />
        </label>
        <label className="ui-field">
          <span className="ui-field__label">Ends</span>
          <input
            className="ui-input"
            defaultValue={content.localEndsAt}
            name="localEndsAt"
            required
            type="datetime-local"
          />
        </label>
        <label className="ui-field">
          <span className="ui-field__label">Timezone</span>
          <input
            className="ui-input"
            defaultValue={content.timezone}
            maxLength={64}
            name="timezone"
            required
          />
        </label>
        <label className="ui-field">
          <span className="ui-field__label">Public address</span>
          <select
            className="ui-input"
            defaultValue={content.privacyMode}
            name="privacyMode"
          >
            <option value="APPROXIMATE_LOCATION">Approximate location</option>
            <option value="EXACT_ADDRESS">Exact address</option>
          </select>
        </label>
        <label className="ui-field admin-review-form__wide">
          <span className="ui-field__label">Address line 1</span>
          <input
            className="ui-input"
            defaultValue={content.addressLine1 ?? ""}
            maxLength={200}
            name="addressLine1"
          />
        </label>
        <label className="ui-field admin-review-form__wide">
          <span className="ui-field__label">Address line 2</span>
          <input
            className="ui-input"
            defaultValue={content.addressLine2 ?? ""}
            maxLength={100}
            name="addressLine2"
          />
        </label>
        <label className="ui-field">
          <span className="ui-field__label">City</span>
          <input
            className="ui-input"
            defaultValue={content.city}
            maxLength={100}
            name="city"
            required
          />
        </label>
        <label className="ui-field">
          <span className="ui-field__label">Region</span>
          <input
            className="ui-input"
            defaultValue={content.region}
            maxLength={100}
            name="region"
            required
          />
        </label>
        <label className="ui-field">
          <span className="ui-field__label">Postal code</span>
          <input
            className="ui-input"
            defaultValue={content.postalCode}
            maxLength={20}
            name="postalCode"
            required
          />
        </label>
        <label className="ui-field">
          <span className="ui-field__label">Country</span>
          <input
            className="ui-input"
            defaultValue={content.countryCode}
            maxLength={2}
            name="countryCode"
            readOnly
          />
        </label>
      </div>

      <p className="ui-alert ui-alert--warning">
        Imported addresses remain approximate unless you explicitly choose exact
        address. Changing address fields clears any prior confirmation.
      </p>
      {message ? (
        <p
          className={
            stale ? "ui-alert ui-alert--warning" : "ui-alert ui-alert--info"
          }
          role="status"
        >
          {message}
          {stale ? (
            <button
              className="ui-button ui-button--secondary"
              onClick={() => router.refresh()}
              type="button"
            >
              Load current version
            </button>
          ) : null}
        </p>
      ) : null}
      {discardStatus ? (
        <p className="ui-alert ui-alert--info" aria-live="polite" role="status">
          {discardStatus}
        </p>
      ) : null}
      <div className="admin-actions">
        <button
          aria-describedby={dirty ? dirtyMessageId : undefined}
          className="ui-button ui-button--primary"
          disabled={pending !== null || !dirty}
          type="submit"
        >
          {pending === "save" ? "Saving…" : "Save changes"}
        </button>
        <button
          aria-describedby={dirty ? dirtyMessageId : undefined}
          className="ui-button ui-button--secondary"
          disabled={pending !== null || !dirty}
          onClick={discard}
          type="button"
        >
          Discard changes
        </button>
        <button
          aria-describedby={dirty ? dirtyMessageId : undefined}
          className="ui-button ui-button--secondary"
          disabled={pending !== null || dirty}
          onClick={() => void mutate("location")}
          type="button"
        >
          {pending === "location" ? "Confirming…" : "Confirm saved location"}
        </button>
      </div>
      {dirty ? (
        <p
          className="ui-alert ui-alert--warning"
          id={dirtyMessageId}
          aria-live="polite"
          role="status"
        >
          {CANDIDATE_DIRTY_MESSAGE}
        </p>
      ) : null}
    </form>
  );
}
