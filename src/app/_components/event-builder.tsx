"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import type {
  AddressPrivacyMode,
  EventEditorDto,
  EventPhotoReservationDto,
  EventType,
} from "@/modules/events";
import { uploadPrivateMedia } from "@/modules/media/client";

import {
  completedWizardSteps,
  EVENT_WIZARD_STEPS,
  resumeEventWizardStep,
  wizardStepAvailable,
  type EventWizardStep,
} from "./event-wizard-state";
import { photoBatchSummary } from "./photo-upload-state";

interface EventResponse {
  readonly event: EventEditorDto;
  readonly error?: string;
  readonly code?: string;
  readonly requestId?: string;
}

interface ReservationResponse {
  readonly reservation: EventPhotoReservationDto;
  readonly error?: string;
  readonly code?: string;
  readonly requestId?: string;
}

type Feedback = { readonly kind: "success" | "error"; readonly text: string };
type UploadStatus =
  "selected" | "reserving" | "uploading" | "processing" | "ready" | "failed";

interface UploadItem {
  readonly id: string;
  readonly file: File;
  readonly status: UploadStatus;
  readonly progress: number;
  readonly error?: string | undefined;
  readonly photoId?: string | undefined;
}

const STEP_LABELS: Readonly<Record<EventWizardStep, string>> = {
  details: "Details",
  schedule: "Schedule",
  location: "Address and privacy",
  photos: "Photos",
  review: "Review, approval and payment",
};

const ACCEPTED_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

const UPLOAD_STATUS_LABELS: Readonly<Record<UploadStatus, string>> = {
  selected: "Selected",
  reserving: "Requesting upload permission",
  uploading: "Uploading",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

function requestError(
  result: {
    readonly error?: string;
    readonly code?: string;
    readonly requestId?: string;
  },
  fallback: string,
): Error {
  const message =
    result.code === "STALE_VERSION"
      ? "This draft changed in another tab. Reload the page, review the latest values, and try again."
      : (result.error ?? fallback);
  return new Error(
    result.requestId ? `${message} Request: ${result.requestId}.` : message,
  );
}

async function jsonRequest<T>(
  url: string,
  method: string,
  body: unknown,
  signal: AbortSignal,
): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: "same-origin",
    cache: "no-store",
    signal,
  };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const response = await fetch(url, init);
  const result = (await response.json()) as T & {
    readonly error?: string;
    readonly code?: string;
    readonly requestId?: string;
  };
  if (!response.ok)
    throw requestError(result, "The event could not be updated.");
  return result;
}

export function CreateEventForm() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const result = await jsonRequest<EventResponse>(
        "/api/events",
        "POST",
        { eventType: data.get("eventType") as EventType },
        controller.signal,
      );
      window.location.assign(`/dashboard/events/${result.event.id}/edit`);
    } catch (error) {
      setMessage(
        error instanceof DOMException && error.name === "AbortError"
          ? "Creation timed out. Try again."
          : error instanceof Error
            ? error.message
            : "Creation failed.",
      );
    } finally {
      window.clearTimeout(timer);
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="compact-form">
      <label>
        Sale type
        <select name="eventType" defaultValue="ESTATE_SALE">
          <option value="ESTATE_SALE">Estate sale</option>
          <option value="YARD_SALE">Yard sale</option>
        </select>
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create event draft"}
      </button>
      <p aria-live="polite">{message}</p>
    </form>
  );
}

export function EventBuilder({
  initialEvent,
  termsVersion,
}: {
  readonly initialEvent: EventEditorDto;
  readonly termsVersion: string;
}) {
  const [draft, setDraft] = useState(initialEvent);
  const draftRef = useRef(initialEvent);
  const controllers = useRef(new Set<AbortController>());
  const [step, setStep] = useState<EventWizardStep>(() =>
    resumeEventWizardStep(initialEvent.steps),
  );
  const [pending, setPending] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [feedback, setFeedback] = useState<
    Partial<Record<EventWizardStep, Feedback>>
  >({});
  const [title, setTitle] = useState(initialEvent.title ?? "");
  const [description, setDescription] = useState(
    initialEvent.description ?? "",
  );
  const [localStartsAt, setLocalStartsAt] = useState(
    initialEvent.localStartsAt ?? "",
  );
  const [localEndsAt, setLocalEndsAt] = useState(
    initialEvent.localEndsAt ?? "",
  );
  const [timezone, setTimezone] = useState(
    initialEvent.timezone ?? "America/Los_Angeles",
  );
  const [addressLine1, setAddressLine1] = useState(
    initialEvent.location?.addressLine1 ?? "",
  );
  const [addressLine2, setAddressLine2] = useState(
    initialEvent.location?.addressLine2 ?? "",
  );
  const [city, setCity] = useState(
    initialEvent.location?.city ?? "Bakersfield",
  );
  const [region, setRegion] = useState(
    initialEvent.location?.region ?? "California",
  );
  const [postalCode, setPostalCode] = useState(
    initialEvent.location?.postalCode ?? "",
  );
  const [countryCode, setCountryCode] = useState(
    initialEvent.location?.countryCode ?? "US",
  );
  const [locationTimezone, setLocationTimezone] = useState(
    initialEvent.location?.timezone ??
      initialEvent.timezone ??
      "America/Los_Angeles",
  );
  const [privacyMode, setPrivacyMode] = useState<AddressPrivacyMode>(
    initialEvent.privacyMode ?? "HIDDEN_UNTIL_START",
  );
  const [uploads, setUploads] = useState<readonly UploadItem[]>([]);
  const [uploadActive, setUploadActive] = useState(false);
  const uploadActiveRef = useRef(false);

  useEffect(
    () => () => {
      for (const controller of controllers.current) controller.abort();
      controllers.current.clear();
    },
    [],
  );

  function syncForms(event: EventEditorDto) {
    setTitle(event.title ?? "");
    setDescription(event.description ?? "");
    setLocalStartsAt(event.localStartsAt ?? "");
    setLocalEndsAt(event.localEndsAt ?? "");
    setTimezone(event.timezone ?? "America/Los_Angeles");
    setAddressLine1(event.location?.addressLine1 ?? "");
    setAddressLine2(event.location?.addressLine2 ?? "");
    setCity(event.location?.city ?? "Bakersfield");
    setRegion(event.location?.region ?? "California");
    setPostalCode(event.location?.postalCode ?? "");
    setCountryCode(event.location?.countryCode ?? "US");
    setLocationTimezone(
      event.location?.timezone ?? event.timezone ?? "America/Los_Angeles",
    );
    setPrivacyMode(event.privacyMode ?? "HIDDEN_UNTIL_START");
  }

  function acceptEvent(event: EventEditorDto) {
    draftRef.current = event;
    setDraft(event);
    syncForms(event);
  }

  async function request<T>(
    url: string,
    method = "GET",
    body?: unknown,
    timeoutMs = 25_000,
  ): Promise<T> {
    const controller = new AbortController();
    controllers.current.add(controller);
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await jsonRequest<T>(url, method, body, controller.signal);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(
          "The server took too long to respond. Nothing was marked saved; try again.",
        );
      }
      throw error;
    } finally {
      window.clearTimeout(timer);
      controllers.current.delete(controller);
    }
  }

  function setStepFeedback(target: EventWizardStep, value: Feedback) {
    setFeedback((current) => ({ ...current, [target]: value }));
  }

  async function saveStep(
    target: EventWizardStep,
    endpoint: string,
    method: string,
    body: Record<string, unknown>,
    complete: (event: EventEditorDto) => boolean,
    next: EventWizardStep,
  ) {
    setPending(target);
    setConfirmation("");
    setStepFeedback(target, { kind: "success", text: "" });
    try {
      const response = await request<EventResponse>(endpoint, method, body);
      acceptEvent(response.event);
      if (!complete(response.event)) {
        setStepFeedback(target, {
          kind: "error",
          text: "The server saved the values but this step is still incomplete.",
        });
        return;
      }
      setStepFeedback(target, {
        kind: "success",
        text: "Saved and confirmed by the server.",
      });
      setConfirmation(
        `${STEP_LABELS[target]} saved and confirmed by the server.`,
      );
      setStep(next);
    } catch (error) {
      setStepFeedback(target, {
        kind: "error",
        text: error instanceof Error ? error.message : "The save failed.",
      });
    } finally {
      setPending("");
    }
  }

  function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveStep(
      "details",
      `/api/events/${draftRef.current.id}`,
      "PATCH",
      { expectedVersion: draftRef.current.version, title, description },
      (saved) => saved.steps.detailsComplete,
      "schedule",
    );
  }

  function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveStep(
      "schedule",
      `/api/events/${draftRef.current.id}/schedule`,
      "PUT",
      {
        expectedVersion: draftRef.current.version,
        localStartsAt,
        localEndsAt,
        timezone,
      },
      (saved) => saved.steps.scheduleComplete,
      "location",
    );
  }

  function saveLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveStep(
      "location",
      `/api/events/${draftRef.current.id}/location`,
      "PUT",
      {
        expectedVersion: draftRef.current.version,
        addressLine1,
        addressLine2,
        city,
        region,
        postalCode,
        countryCode,
        timezone: locationTimezone,
        privacyMode,
      },
      (saved) => saved.steps.locationComplete,
      "photos",
    );
  }

  function choosePhotos(event: ChangeEvent<HTMLInputElement>) {
    const selected = [...(event.currentTarget.files ?? [])];
    const items = selected.map<UploadItem>((file) => {
      const error = !ACCEPTED_PHOTO_TYPES.has(file.type)
        ? "Unsupported format. Choose JPEG, PNG, WebP, HEIC, or HEIF."
        : file.size <= 0
          ? "This file is empty."
          : file.size > MAX_PHOTO_BYTES
            ? "This file exceeds the 15 MB limit."
            : undefined;
      return {
        id: crypto.randomUUID(),
        file,
        status: error ? "failed" : "selected",
        progress: 0,
        error,
      };
    });
    setUploads((current) => [...current, ...items]);
    event.currentTarget.value = "";
    void uploadSelected(items);
  }

  function updateUpload(id: string, changes: Partial<UploadItem>) {
    setUploads((current) =>
      current.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );
  }

  async function refreshEvent() {
    const response = await request<EventResponse>(
      `/api/events/${draftRef.current.id}`,
    );
    acceptEvent(response.event);
    return response.event;
  }

  async function cleanupReservation(photoId: string) {
    const response = await request<EventResponse>(
      `/api/events/${draftRef.current.id}/photos/${photoId}`,
      "DELETE",
      { expectedVersion: draftRef.current.version },
    );
    acceptEvent(response.event);
  }

  async function uploadOne(item: UploadItem): Promise<boolean> {
    let photoId: string | undefined;
    try {
      if (
        item.photoId &&
        draftRef.current.photos.some(
          (photo) => photo.id === item.photoId && photo.status !== "READY",
        )
      ) {
        await cleanupReservation(item.photoId);
      }
      updateUpload(item.id, {
        status: "reserving",
        progress: 10,
        error: undefined,
      });
      const reserved = await request<ReservationResponse>(
        `/api/events/${draftRef.current.id}/photos/reserve`,
        "POST",
        {
          expectedVersion: draftRef.current.version,
          contentType: item.file.type,
          fileName: item.file.name,
        },
      );
      photoId = reserved.reservation.photoId;
      acceptEvent(reserved.reservation.event);
      updateUpload(item.id, { status: "uploading", progress: 35, photoId });

      const controller = new AbortController();
      controllers.current.add(controller);
      const timer = window.setTimeout(() => controller.abort(), 60_000);
      let uploadedPathname: string;
      try {
        if (reserved.reservation.transport === "vercel-client") {
          const uploaded = await uploadPrivateMedia({
            pathname: reserved.reservation.uploadPathname,
            file: item.file,
            handleUploadUrl: `/api/events/${draftRef.current.id}/photos/upload`,
            clientPayload: JSON.stringify({
              expectedVersion: draftRef.current.version,
              reservationId: reserved.reservation.reservationId,
              photoId: reserved.reservation.photoId,
            }),
            contentType: item.file.type,
            abortSignal: controller.signal,
            onProgress(percentage) {
              updateUpload(item.id, {
                progress: 35 + Math.round(percentage * 0.4),
              });
            },
          });
          uploadedPathname = uploaded.pathname;
        } else {
          const upload = await fetch(reserved.reservation.uploadUrl, {
            method: reserved.reservation.method,
            headers: {
              ...reserved.reservation.uploadHeaders,
              "Content-Type": item.file.type,
            },
            body: item.file,
            signal: controller.signal,
          });
          if (!upload.ok) {
            throw new Error(
              `The isolated test upload failed (${String(upload.status)}).`,
            );
          }
          uploadedPathname = reserved.reservation.uploadPathname;
        }
      } finally {
        window.clearTimeout(timer);
        controllers.current.delete(controller);
      }
      if (uploadedPathname !== reserved.reservation.uploadPathname) {
        throw new Error("The uploaded Blob did not match its reservation.");
      }

      updateUpload(item.id, { status: "processing", progress: 75 });
      const completed = await request<EventResponse>(
        `/api/events/${draftRef.current.id}/photos/${photoId}/finalize`,
        "POST",
        {
          expectedVersion: draftRef.current.version,
          reservationId: reserved.reservation.reservationId,
          pathname: uploadedPathname,
        },
        90_000,
      );
      acceptEvent(completed.event);
      if (
        !completed.event.photos.some(
          (photo) => photo.id === photoId && photo.status === "READY",
        )
      ) {
        throw new Error("The server did not confirm this photo as READY.");
      }
      updateUpload(item.id, { status: "ready", progress: 100 });
      return true;
    } catch (error) {
      if (photoId) {
        try {
          await refreshEvent();
          if (
            draftRef.current.photos.some(
              (photo) => photo.id === photoId && photo.status === "RESERVED",
            )
          ) {
            await cleanupReservation(photoId);
          }
        } catch {
          // The server reservation expires independently; keep the original bounded error.
        }
      }
      updateUpload(item.id, {
        status: "failed",
        progress: 0,
        photoId,
        error: error instanceof Error ? error.message : "Photo upload failed.",
      });
      return false;
    }
  }

  async function uploadSelected(batch: readonly UploadItem[]) {
    if (uploadActiveRef.current || batch.length === 0) return;
    uploadActiveRef.current = true;
    setUploadActive(true);
    setPending("photos");
    setStepFeedback("photos", { kind: "success", text: "" });
    const hadReadyPhotos = draftRef.current.photos.some(
      (photo) => photo.status === "READY",
    );
    const hadReadyCover = draftRef.current.photos.some(
      (photo) => photo.status === "READY" && photo.isCover,
    );
    try {
      const candidates = batch.filter(
        (item) =>
          (item.status === "selected" || item.status === "failed") &&
          (!item.error || item.photoId),
      );
      let succeeded = 0;
      for (const item of candidates) {
        if (await uploadOne(item)) succeeded += 1;
      }
      try {
        await refreshEvent();
      } catch {
        // Each ambiguous per-file failure already attempted reconciliation.
      }
      const failed = batch.length - succeeded;
      const text = photoBatchSummary({
        succeeded,
        failed,
        hadReadyCover,
        hadReadyPhotos,
        hasReadyCover: draftRef.current.photos.some(
          (photo) => photo.status === "READY" && photo.isCover,
        ),
      });
      setStepFeedback("photos", {
        kind: failed > 0 ? "error" : "success",
        text,
      });
    } finally {
      setPending("");
      setUploadActive(false);
      uploadActiveRef.current = false;
    }
  }

  async function mutatePhoto(
    name: string,
    endpoint: string,
    method: string,
    body: object,
  ) {
    setPending(name);
    try {
      const response = await request<EventResponse>(endpoint, method, body);
      acceptEvent(response.event);
      setStepFeedback("photos", {
        kind: "success",
        text: "Photo changes saved.",
      });
    } catch (error) {
      setStepFeedback("photos", {
        kind: "error",
        text:
          error instanceof Error ? error.message : "The photo change failed.",
      });
    } finally {
      setPending("");
    }
  }

  function selectCover(photoId: string) {
    void mutatePhoto(
      "cover",
      `/api/events/${draftRef.current.id}/photos/${photoId}/cover`,
      "PUT",
      { expectedVersion: draftRef.current.version },
    );
  }

  function removePhoto(photoId: string) {
    void mutatePhoto(
      "delete-photo",
      `/api/events/${draftRef.current.id}/photos/${photoId}`,
      "DELETE",
      { expectedVersion: draftRef.current.version },
    );
  }

  async function removeUpload(item: UploadItem) {
    if (uploadActive) return;
    if (
      item.photoId &&
      draftRef.current.photos.some((photo) => photo.id === item.photoId)
    ) {
      await cleanupReservation(item.photoId).catch((error: unknown) => {
        setStepFeedback("photos", {
          kind: "error",
          text:
            error instanceof Error
              ? error.message
              : "The photo could not be removed.",
        });
      });
    }
    setUploads((current) =>
      current.filter((candidate) => candidate.id !== item.id),
    );
  }

  async function continueFromPhotos() {
    setPending("photos-continue");
    try {
      const event = await refreshEvent();
      if (!event.steps.photosComplete) {
        setStepFeedback("photos", {
          kind: "error",
          text: "Upload at least one photo that reaches READY and explicitly select a READY cover photo.",
        });
        return;
      }
      setStepFeedback("photos", {
        kind: "success",
        text: "Photos confirmed by the server.",
      });
      setStep("review");
    } catch (error) {
      setStepFeedback("photos", {
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Photo readiness could not be confirmed.",
      });
    } finally {
      setPending("");
    }
  }

  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (data.get("acceptedTerms") !== "yes") {
      setStepFeedback("review", {
        kind: "error",
        text: "Accept the publishing terms before approval.",
      });
      return;
    }
    setPending("approval");
    try {
      const response = await request<EventResponse>(
        `/api/events/${draftRef.current.id}/approval`,
        "POST",
        {
          expectedVersion: draftRef.current.version,
          acceptedTerms: true,
          termsVersion,
        },
        30_000,
      );
      acceptEvent(response.event);
      setStepFeedback("review", {
        kind: "success",
        text: `Revision ${String(response.event.approvedRevision)} approved. Opening payment…`,
      });
      window.location.assign(`/dashboard/events/${response.event.id}/payment`);
    } catch (error) {
      setStepFeedback("review", {
        kind: "error",
        text: error instanceof Error ? error.message : "Approval failed.",
      });
    } finally {
      setPending("");
    }
  }

  const completed = completedWizardSteps(draft.steps);
  const currentFeedback = feedback[step];

  return (
    <div className="builder-layout">
      <nav aria-label="Event builder progress" className="wizard-timeline">
        {EVENT_WIZARD_STEPS.map((item, index) => {
          const available = wizardStepAvailable(item, draft.steps);
          const current = item === step;
          return (
            <button
              key={item}
              type="button"
              className={
                current ? "is-current" : completed[item] ? "is-complete" : ""
              }
              disabled={!available || Boolean(pending) || uploadActive}
              aria-current={current ? "step" : undefined}
              onClick={() => setStep(item)}
            >
              <span aria-hidden="true">
                {completed[item] ? "✓" : index + 1}
              </span>
              {STEP_LABELS[item]}
            </button>
          );
        })}
      </nav>

      <p className="wizard-version">Server draft version {draft.version}</p>
      {confirmation ? (
        <p className="success-box" role="status">
          {confirmation}
        </p>
      ) : null}

      {step === "details" ? (
        <section className="builder-card" aria-labelledby="details-title">
          <p className="eyebrow">Step 1 of 5</p>
          <h2 id="details-title">Event details</h2>
          <form onSubmit={saveDetails}>
            <label>
              Public title
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                minLength={3}
                maxLength={120}
                required
              />
            </label>
            <label>
              Public description
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                minLength={20}
                maxLength={5000}
                rows={7}
                required
              />
            </label>
            <StepFeedback feedback={currentFeedback} />
            <div className="wizard-actions">
              <span />
              <button disabled={Boolean(pending)} type="submit">
                {pending === "details" ? "Saving…" : "Save and continue"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {step === "schedule" ? (
        <section className="builder-card" aria-labelledby="schedule-title">
          <p className="eyebrow">Step 2 of 5</p>
          <h2 id="schedule-title">Local schedule</h2>
          <p>
            Times are validated on the server, including daylight-saving gaps
            and overlaps.
          </p>
          <form onSubmit={saveSchedule}>
            <label>
              Starts
              <input
                value={localStartsAt}
                onChange={(e) => setLocalStartsAt(e.target.value)}
                type="datetime-local"
                required
              />
            </label>
            <label>
              Ends
              <input
                value={localEndsAt}
                onChange={(e) => setLocalEndsAt(e.target.value)}
                type="datetime-local"
                required
              />
            </label>
            <label>
              IANA timezone
              <input
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                required
              />
            </label>
            <StepFeedback feedback={currentFeedback} />
            <WizardActions
              back={() => setStep("details")}
              pending={pending === "schedule"}
            />
          </form>
        </section>
      ) : null}

      {step === "location" ? (
        <section className="builder-card" aria-labelledby="location-title">
          <p className="eyebrow">Step 3 of 5</p>
          <h2 id="location-title">Address and privacy</h2>
          <form onSubmit={saveLocation}>
            <label>
              Street address
              <input
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                autoComplete="street-address"
                required
              />
            </label>
            <label>
              Unit or suite (optional)
              <input
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
              />
            </label>
            <div className="form-grid">
              <label>
                City
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required
                />
              </label>
              <label>
                State
                <input
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  required
                />
              </label>
              <label>
                Postal code
                <input
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  required
                />
              </label>
              <label>
                Country
                <input
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  required
                />
              </label>
            </div>
            <label>
              Address timezone
              <input
                value={locationTimezone}
                onChange={(e) => setLocationTimezone(e.target.value)}
                required
              />
            </label>
            <fieldset>
              <legend>Address privacy</legend>
              {(
                [
                  ["EXACT_ADDRESS", "Show exact address"],
                  [
                    "APPROXIMATE_LOCATION",
                    "Show only an approximate Bakersfield-area label",
                  ],
                  [
                    "HIDDEN_UNTIL_START",
                    "Hide exact address until the event starts",
                  ],
                ] as const
              ).map(([value, label]) => (
                <label className="radio-label" key={value}>
                  <input
                    type="radio"
                    name="privacyMode"
                    value={value}
                    checked={privacyMode === value}
                    onChange={() => setPrivacyMode(value)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <StepFeedback feedback={currentFeedback} />
            <WizardActions
              back={() => setStep("schedule")}
              pending={pending === "location"}
              loadingLabel="Validating…"
            />
          </form>
        </section>
      ) : null}

      {step === "photos" ? (
        <section className="builder-card" aria-labelledby="photos-title">
          <p className="eyebrow">Step 4 of 5</p>
          <h2 id="photos-title">Photos</h2>
          <p>
            Select several images at once. Every file is validated before its
            private reservation, then sanitized and finalized independently.
          </p>
          <label>
            Event photos (JPEG, PNG, WebP, HEIC, or HEIF; maximum 15 MB each)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              multiple
              onChange={choosePhotos}
              disabled={uploadActive}
            />
          </label>
          {uploads.length ? (
            <ul className="upload-queue" aria-label="Selected photo uploads">
              {uploads.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.file.name}</strong>
                    <span>
                      {UPLOAD_STATUS_LABELS[item.status]} · {item.progress}%
                    </span>
                    {item.error ? <small>{item.error}</small> : null}
                  </div>
                  <progress max={100} value={item.progress}>
                    {item.progress}%
                  </progress>
                  <div className="button-row">
                    {item.status === "failed" &&
                    (!item.error || item.photoId) ? (
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={uploadActive}
                        onClick={() => void uploadSelected([item])}
                      >
                        Retry
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="danger-button"
                      disabled={uploadActive}
                      onClick={() => void removeUpload(item)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          {uploadActive ? (
            <p role="status">Uploading and processing selected photos…</p>
          ) : null}
          {draft.photos.length ? (
            <ol className="photo-list" aria-label="Event photo order">
              {draft.photos.map((photo, index) => (
                <li key={photo.id}>
                  {photo.status === "READY" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo.urls.thumbnail}
                      alt={`Event photo ${index + 1}`}
                    />
                  ) : (
                    <div className="photo-placeholder">{photo.status}</div>
                  )}
                  <div>
                    <strong>
                      Photo {index + 1} {photo.isCover ? "— Cover" : ""}
                    </strong>
                    <p>Status: {photo.status}</p>
                    {photo.errorCode ? (
                      <p>Safe error: {photo.errorCode}</p>
                    ) : null}
                    <div className="button-row">
                      {photo.status === "READY" && !photo.isCover ? (
                        <button
                          type="button"
                          className="secondary-button"
                          aria-label={`Make photo ${index + 1} cover`}
                          disabled={Boolean(pending) || uploadActive}
                          onClick={() => selectCover(photo.id)}
                        >
                          Make cover
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="danger-button"
                        disabled={Boolean(pending) || uploadActive}
                        onClick={() => removePhoto(photo.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p>No server-stored photos yet.</p>
          )}
          <StepFeedback feedback={currentFeedback} />
          <div className="wizard-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={Boolean(pending) || uploadActive}
              onClick={() => setStep("location")}
            >
              Back
            </button>
            <button
              type="button"
              disabled={
                Boolean(pending) || uploadActive || !draft.steps.photosComplete
              }
              onClick={() => void continueFromPhotos()}
            >
              {pending === "photos-continue"
                ? "Checking…"
                : "Save and continue"}
            </button>
          </div>
        </section>
      ) : null}

      {step === "review" ? (
        <section className="builder-card" aria-labelledby="review-title">
          <p className="eyebrow">Step 5 of 5</p>
          <h2 id="review-title">Review, approval and payment</h2>
          <dl className="status-list">
            <div>
              <dt>Draft state</dt>
              <dd>{draft.workflowState.replaceAll("_", " ")}</dd>
            </div>
            <div>
              <dt>Content revision</dt>
              <dd>{draft.contentRevision}</dd>
            </div>
            <div>
              <dt>Approval</dt>
              <dd>{draft.approvalStatus.replaceAll("_", " ")}</dd>
            </div>
          </dl>
          {!draft.steps.reviewReady ? (
            <div className="warning-box">
              <h3>Still needed</h3>
              <ul>
                {draft.readiness.missing.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setStep(resumeEventWizardStep(draft.steps))}
              >
                Return to incomplete step
              </button>
            </div>
          ) : (
            <p className="success-box">
              All server requirements are complete. Review the exact listing
              before approval.
            </p>
          )}
          {draft.steps.reviewReady ? (
            <p>
              <Link
                className="button-link"
                href={`/dashboard/events/${draft.id}/preview`}
              >
                Open exact listing preview
              </Link>
            </p>
          ) : (
            <p>
              Exact preview is unavailable until the incomplete steps above are
              saved.
            </p>
          )}
          <form onSubmit={approve}>
            <label className="checkbox-label">
              <input type="checkbox" name="acceptedTerms" value="yes" />I accept
              publishing terms version {termsVersion} and approve this exact
              event revision for payment.
            </label>
            <StepFeedback feedback={currentFeedback} />
            <div className="wizard-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={Boolean(pending)}
                onClick={() => setStep("photos")}
              >
                Back
              </button>
              <button
                disabled={!draft.steps.reviewReady || Boolean(pending)}
                type="submit"
              >
                {pending === "approval"
                  ? "Approving…"
                  : "Approve exact revision"}
              </button>
            </div>
          </form>
          {draft.approvalStatus === "APPROVED" ? (
            <p className="success-box">
              Revision {draft.approvedRevision} approved. Continue on the
              dedicated payment page.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function StepFeedback({
  feedback,
}: {
  readonly feedback: Feedback | undefined;
}) {
  if (!feedback?.text) return null;
  return (
    <p
      className={feedback.kind === "error" ? "form-message" : "success-box"}
      role={feedback.kind === "error" ? "alert" : "status"}
    >
      {feedback.text}
    </p>
  );
}

function WizardActions({
  back,
  pending,
  loadingLabel = "Saving…",
}: {
  readonly back: () => void;
  readonly pending: boolean;
  readonly loadingLabel?: string;
}) {
  return (
    <div className="wizard-actions">
      <button
        type="button"
        className="secondary-button"
        disabled={pending}
        onClick={back}
      >
        Back
      </button>
      <button disabled={pending} type="submit">
        {pending ? loadingLabel : "Save and continue"}
      </button>
    </div>
  );
}
