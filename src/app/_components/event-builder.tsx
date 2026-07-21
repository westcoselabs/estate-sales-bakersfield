"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import type {
  EventEditorDto,
  EventPhotoReservationDto,
  EventType,
} from "@/modules/events";

interface EventResponse {
  readonly event: EventEditorDto;
  readonly error?: string;
  readonly code?: string;
}

interface ReservationResponse {
  readonly reservation: EventPhotoReservationDto;
  readonly error?: string;
}

async function jsonRequest<T>(
  url: string,
  method: string,
  body: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as T & {
    readonly error?: string;
    readonly code?: string;
  };
  if (!response.ok) {
    const message =
      result.code === "STALE_VERSION"
        ? "This draft changed in another tab. Reload the page before continuing."
        : (result.error ?? "The event could not be updated.");
    throw new Error(message);
  }
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
    try {
      const result = await jsonRequest<EventResponse>("/api/events", "POST", {
        eventType: data.get("eventType") as EventType,
      });
      window.location.assign(`/dashboard/events/${result.event.id}/edit`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Creation failed.");
    } finally {
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
  const [pending, setPending] = useState("");
  const [message, setMessage] = useState("");

  async function mutation(
    name: string,
    endpoint: string,
    method: string,
    body: Record<string, unknown>,
  ) {
    setPending(name);
    setMessage("");
    try {
      const response = await jsonRequest<EventResponse>(endpoint, method, body);
      setDraft(response.event);
      setMessage("Draft saved.");
      return response.event;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The update failed.");
      return null;
    } finally {
      setPending("");
    }
  }

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await mutation("details", `/api/events/${draft.id}`, "PATCH", {
      expectedVersion: draft.version,
      title: data.get("title"),
      description: data.get("description"),
    });
  }

  async function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await mutation("schedule", `/api/events/${draft.id}/schedule`, "PUT", {
      expectedVersion: draft.version,
      localStartsAt: data.get("localStartsAt"),
      localEndsAt: data.get("localEndsAt"),
      timezone: data.get("timezone"),
    });
  }

  async function saveLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await mutation("location", `/api/events/${draft.id}/location`, "PUT", {
      expectedVersion: draft.version,
      addressLine1: data.get("addressLine1"),
      addressLine2: data.get("addressLine2"),
      city: data.get("city"),
      region: data.get("region"),
      postalCode: data.get("postalCode"),
      countryCode: data.get("countryCode"),
      timezone: data.get("timezone"),
      privacyMode: data.get("privacyMode"),
    });
  }

  async function uploadPhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const file = data.get("photo");
    if (!(file instanceof File) || file.size === 0) {
      setMessage("Choose an image before uploading.");
      return;
    }
    setPending("photo");
    setMessage("");
    try {
      const reserved = await jsonRequest<ReservationResponse>(
        `/api/events/${draft.id}/photos/reserve`,
        "POST",
        {
          expectedVersion: draft.version,
          contentType: file.type,
          fileName: file.name,
        },
      );
      setDraft(reserved.reservation.event);
      const upload = await fetch(reserved.reservation.uploadUrl, {
        method: reserved.reservation.method,
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!upload.ok) throw new Error("The private image upload failed.");
      const completed = await jsonRequest<EventResponse>(
        `/api/events/${draft.id}/photos/${reserved.reservation.photoId}/finalize`,
        "POST",
        {
          expectedVersion: reserved.reservation.event.version,
          reservationId: reserved.reservation.reservationId,
        },
      );
      setDraft(completed.event);
      setMessage("Photo uploaded and sanitized.");
      event.currentTarget.reset();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Photo upload failed.",
      );
    } finally {
      setPending("");
    }
  }

  async function selectCover(photoId: string) {
    await mutation(
      "cover",
      `/api/events/${draft.id}/photos/${photoId}/cover`,
      "PUT",
      { expectedVersion: draft.version },
    );
  }

  async function removePhoto(photoId: string) {
    await mutation(
      "delete-photo",
      `/api/events/${draft.id}/photos/${photoId}`,
      "DELETE",
      { expectedVersion: draft.version },
    );
  }

  async function movePhoto(photoId: string, direction: -1 | 1) {
    const ids = draft.photos.map((photo) => photo.id);
    const index = ids.indexOf(photoId);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= ids.length) return;
    [ids[index], ids[next]] = [ids[next]!, ids[index]!];
    await mutation("order", `/api/events/${draft.id}/photos/order`, "PUT", {
      expectedVersion: draft.version,
      photoIds: ids,
    });
  }

  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (data.get("acceptedTerms") !== "yes") {
      setMessage("Accept the publishing terms before approval.");
      return;
    }
    const result = await mutation(
      "approval",
      `/api/events/${draft.id}/approval`,
      "POST",
      {
        expectedVersion: draft.version,
        acceptedTerms: true,
        termsVersion,
      },
    );
    if (result)
      setMessage("This exact event revision is approved for future payment.");
  }

  return (
    <div className="builder-layout">
      <nav aria-label="Event builder steps" className="step-nav">
        <a href="#details">1. Details</a>
        <a href="#schedule">2. Schedule</a>
        <a href="#location">3. Address</a>
        <a href="#photos">4. Photos</a>
        <a href="#approval">5. Preview &amp; approval</a>
      </nav>

      <div
        className={message ? "form-message" : "form-message is-empty"}
        role={message ? "alert" : undefined}
        aria-live="polite"
      >
        {message || "No current form message."}
      </div>

      <section
        id="details"
        className="builder-card"
        aria-labelledby="details-title"
      >
        <p className="eyebrow">Step 1</p>
        <h2 id="details-title">Event details</h2>
        <form onSubmit={saveDetails}>
          <label>
            Public title
            <input
              name="title"
              defaultValue={draft.title ?? ""}
              minLength={3}
              maxLength={120}
              required
            />
          </label>
          <label>
            Public description
            <textarea
              name="description"
              defaultValue={draft.description ?? ""}
              minLength={20}
              maxLength={5000}
              rows={7}
              required
            />
          </label>
          <button disabled={Boolean(pending)} type="submit">
            {pending === "details" ? "Saving…" : "Save details"}
          </button>
        </form>
      </section>

      <section
        id="schedule"
        className="builder-card"
        aria-labelledby="schedule-title"
      >
        <p className="eyebrow">Step 2</p>
        <h2 id="schedule-title">Local schedule</h2>
        <p>
          Times are validated on the server, including daylight-saving gaps and
          overlaps.
        </p>
        <form onSubmit={saveSchedule}>
          <label>
            Starts
            <input
              name="localStartsAt"
              type="datetime-local"
              defaultValue={draft.localStartsAt ?? ""}
              required
            />
          </label>
          <label>
            Ends
            <input
              name="localEndsAt"
              type="datetime-local"
              defaultValue={draft.localEndsAt ?? ""}
              required
            />
          </label>
          <label>
            IANA timezone
            <input
              name="timezone"
              defaultValue={draft.timezone ?? "America/Los_Angeles"}
              required
            />
          </label>
          <button disabled={Boolean(pending)} type="submit">
            {pending === "schedule" ? "Saving…" : "Save schedule"}
          </button>
        </form>
      </section>

      <section
        id="location"
        className="builder-card"
        aria-labelledby="location-title"
      >
        <p className="eyebrow">Step 3</p>
        <h2 id="location-title">Address and privacy</h2>
        <form onSubmit={saveLocation}>
          <label>
            Street address
            <input
              name="addressLine1"
              defaultValue={draft.location?.addressLine1 ?? ""}
              autoComplete="street-address"
              required
            />
          </label>
          <label>
            Unit or suite (optional)
            <input
              name="addressLine2"
              defaultValue={draft.location?.addressLine2 ?? ""}
            />
          </label>
          <div className="form-grid">
            <label>
              City
              <input
                name="city"
                defaultValue={draft.location?.city ?? "Bakersfield"}
                required
              />
            </label>
            <label>
              State
              <input
                name="region"
                defaultValue={draft.location?.region ?? "California"}
                required
              />
            </label>
            <label>
              Postal code
              <input
                name="postalCode"
                defaultValue={draft.location?.postalCode ?? ""}
                required
              />
            </label>
            <label>
              Country
              <input
                name="countryCode"
                defaultValue={draft.location?.countryCode ?? "US"}
                required
              />
            </label>
          </div>
          <label>
            Address timezone
            <input
              name="timezone"
              defaultValue={
                draft.location?.timezone ??
                draft.timezone ??
                "America/Los_Angeles"
              }
              required
            />
          </label>
          <fieldset>
            <legend>Address privacy</legend>
            <label className="radio-label">
              <input
                type="radio"
                name="privacyMode"
                value="EXACT_ADDRESS"
                defaultChecked={draft.privacyMode === "EXACT_ADDRESS"}
              />
              Show exact address
            </label>
            <label className="radio-label">
              <input
                type="radio"
                name="privacyMode"
                value="APPROXIMATE_LOCATION"
                defaultChecked={draft.privacyMode === "APPROXIMATE_LOCATION"}
              />
              Show only an approximate Bakersfield-area label
            </label>
            <label className="radio-label">
              <input
                type="radio"
                name="privacyMode"
                value="HIDDEN_UNTIL_START"
                defaultChecked={
                  draft.privacyMode === "HIDDEN_UNTIL_START" ||
                  !draft.privacyMode
                }
              />
              Hide exact address until the event starts
            </label>
          </fieldset>
          <button disabled={Boolean(pending)} type="submit">
            {pending === "location"
              ? "Validating…"
              : "Validate and save address"}
          </button>
        </form>
      </section>

      <section
        id="photos"
        className="builder-card"
        aria-labelledby="photos-title"
      >
        <p className="eyebrow">Step 4</p>
        <h2 id="photos-title">Photos</h2>
        <p>Images are decoded, metadata-stripped, and re-encoded before use.</p>
        <form onSubmit={uploadPhoto}>
          <label>
            Upload an event photo (JPEG, PNG, WebP, HEIC, or HEIF; maximum 15
            MB)
            <input
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              required
            />
          </label>
          <button disabled={Boolean(pending)} type="submit">
            {pending === "photo" ? "Uploading and processing…" : "Upload photo"}
          </button>
        </form>
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
                  <div className="button-row">
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={index === 0 || Boolean(pending)}
                      onClick={() => movePhoto(photo.id, -1)}
                      aria-label={`Move photo ${index + 1} earlier`}
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={
                        index === draft.photos.length - 1 || Boolean(pending)
                      }
                      onClick={() => movePhoto(photo.id, 1)}
                      aria-label={`Move photo ${index + 1} later`}
                    >
                      Move down
                    </button>
                    {photo.status === "READY" && !photo.isCover ? (
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={Boolean(pending)}
                        onClick={() => selectCover(photo.id)}
                      >
                        Make cover
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="danger-button"
                      disabled={Boolean(pending)}
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
          <p>No photos uploaded yet.</p>
        )}
      </section>

      <section
        id="approval"
        className="builder-card"
        aria-labelledby="approval-title"
      >
        <p className="eyebrow">Step 5</p>
        <h2 id="approval-title">Preview and approve</h2>
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
        {!draft.readiness.ready ? (
          <div className="warning-box">
            <h3>Still needed</h3>
            <ul>
              {draft.readiness.missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="success-box">This draft is ready for exact preview.</p>
        )}
        <p>
          <Link href={`/dashboard/events/${draft.id}/preview`}>
            Open exact listing preview
          </Link>
          {" · "}
          Future path: <code>{draft.futurePublicPath}</code>
        </p>
        <form onSubmit={approve}>
          <label className="checkbox-label">
            <input type="checkbox" name="acceptedTerms" value="yes" />I accept
            publishing terms version {termsVersion} and approve this exact event
            revision for future payment.
          </label>
          <button
            disabled={!draft.readiness.ready || Boolean(pending)}
            type="submit"
          >
            {pending === "approval" ? "Approving…" : "Approve exact revision"}
          </button>
        </form>
        {draft.approvalStatus === "APPROVED" ? (
          <p className="success-box">
            Revision {draft.approvedRevision} approved. Any material edit will
            invalidate it.
          </p>
        ) : null}
      </section>
    </div>
  );
}
