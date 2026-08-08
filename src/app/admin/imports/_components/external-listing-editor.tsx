"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export interface ExternalListingEditorContent {
  readonly eventType: "ESTATE_SALE" | "YARD_SALE";
  readonly title: string;
  readonly description: string;
  readonly localStartsAt: string;
  readonly localEndsAt: string;
  readonly timezone: string;
  readonly privacyMode: "APPROXIMATE_LOCATION" | "EXACT_ADDRESS";
}

export interface ExternalListingEditorProps {
  readonly listingId: string;
  readonly version: number;
  readonly content: ExternalListingEditorContent;
  readonly disabled?: boolean;
}

interface ApiResponseBody {
  readonly code?: string;
  readonly error?: string;
}

type Feedback = {
  readonly kind: "success" | "error" | "stale";
  readonly message: string;
};

function contentFrom(form: FormData): ExternalListingEditorContent {
  return {
    eventType:
      form.get("eventType") === "YARD_SALE" ? "YARD_SALE" : "ESTATE_SALE",
    title: String(form.get("title") ?? ""),
    description: String(form.get("description") ?? ""),
    localStartsAt: String(form.get("localStartsAt") ?? ""),
    localEndsAt: String(form.get("localEndsAt") ?? ""),
    timezone: String(form.get("timezone") ?? ""),
    privacyMode:
      form.get("privacyMode") === "EXACT_ADDRESS"
        ? "EXACT_ADDRESS"
        : "APPROXIMATE_LOCATION",
  };
}

async function responseBody(response: Response): Promise<ApiResponseBody> {
  try {
    return (await response.json()) as ApiResponseBody;
  } catch {
    return {};
  }
}

export function ExternalListingEditor({
  listingId,
  version,
  content,
  disabled = false,
}: ExternalListingEditorProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function submit() {
    if (!formRef.current || disabled) return;
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/imports/listings/${listingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: version,
          ...contentFrom(new FormData(formRef.current)),
        }),
      });
      const body = await responseBody(response);
      if (!response.ok) {
        const stale = response.status === 409 && body.code === "STALE_VERSION";
        setFeedback({
          kind: stale ? "stale" : "error",
          message:
            body.error ??
            (stale
              ? "The listing changed. Load the current version before editing again."
              : "The listing could not be updated."),
        });
        return;
      }
      setFeedback({ kind: "success", message: "Listing changes saved." });
      router.refresh();
    } catch {
      setFeedback({
        kind: "error",
        message: "The listing could not be updated. Please try again.",
      });
    } finally {
      setPending(false);
    }
  }

  const stale = feedback?.kind === "stale";

  return (
    <form
      className="admin-panel admin-review-form"
      key={`${listingId}:${version}`}
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <header>
        <div>
          <p className="eyebrow">Published content</p>
          <h2>Edit external listing</h2>
        </div>
        <span className="admin-status">Version {version}</span>
      </header>

      <div className="admin-review-form__grid">
        <label className="ui-field">
          <span className="ui-field__label">Sale type</span>
          <select
            className="ui-input"
            defaultValue={content.eventType}
            disabled={disabled}
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
            disabled={disabled}
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
            disabled={disabled}
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
            disabled={disabled}
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
            disabled={disabled}
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
            disabled={disabled}
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
            disabled={disabled}
            name="privacyMode"
          >
            <option value="APPROXIMATE_LOCATION">Approximate location</option>
            <option value="EXACT_ADDRESS">Exact address</option>
          </select>
        </label>
      </div>

      <p className="ui-alert ui-alert--warning">
        Exact address makes the confirmed listing address public. Review the
        location before changing this setting.
      </p>
      {disabled ? (
        <p className="ui-alert ui-alert--info">
          This listing is no longer editable in its current lifecycle state.
        </p>
      ) : null}
      {feedback ? (
        <div
          className={`ui-alert ui-alert--${
            feedback.kind === "success"
              ? "success"
              : feedback.kind === "stale"
                ? "warning"
                : "error"
          }`}
          role={feedback.kind === "error" ? "alert" : "status"}
        >
          <p>{feedback.message}</p>
          {feedback.kind === "stale" ? (
            <button
              className="ui-button ui-button--secondary"
              onClick={() => router.refresh()}
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
          disabled={disabled || pending || stale}
          type="submit"
        >
          {pending ? "Saving…" : "Save listing"}
        </button>
      </div>
    </form>
  );
}
