"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/components/ui/icons";
import {
  AddressAutocomplete,
  type ClientAddressSuggestion,
} from "@/features/location/address-autocomplete";
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
import { photoBatchSummary, photoUploadTimeoutMs } from "./photo-upload-state";

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

interface AccountResponse {
  readonly account: {
    readonly emailVerified: boolean;
  } | null;
  readonly error?: string;
  readonly code?: string;
  readonly requestId?: string;
}

interface MessageResponse {
  readonly message?: string;
  readonly error?: string;
  readonly code?: string;
  readonly requestId?: string;
}

type Feedback = { readonly kind: "success" | "error"; readonly text: string };
type UploadStatus =
  "selected" | "reserving" | "uploading" | "processing" | "ready" | "failed";

interface UploadItem {
  readonly id: string;
  readonly file?: File | undefined;
  readonly fileName: string;
  readonly fileSize: number;
  readonly previewUrl: string;
  readonly previewIsLocal: boolean;
  readonly status: UploadStatus;
  readonly progress: number;
  readonly retryable: boolean;
  readonly error?: string | undefined;
  readonly photoId?: string | undefined;
}

interface PhotoManagerRow {
  readonly key: string;
  readonly upload?: UploadItem | undefined;
  readonly photo?: EventEditorDto["photos"][number] | undefined;
  readonly photoIndex: number;
}

interface PhotoActionDropdownProps {
  readonly photoId: string;
  readonly label: string;
  readonly canMoveEarlier: boolean;
  readonly canMoveLater: boolean;
  readonly canMakeCover: boolean;
  readonly disabled: boolean;
  readonly onMoveEarlier: () => void;
  readonly onMoveLater: () => void;
  readonly onMakeCover: () => void;
  readonly onDelete: () => void;
}

function PhotoActionDropdown({
  photoId,
  label,
  canMoveEarlier,
  canMoveLater,
  canMakeCover,
  disabled,
  onMoveEarlier,
  onMoveLater,
  onMakeCover,
  onDelete,
}: PhotoActionDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 8, left: 8 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = `photo-actions-${photoId}`;

  const positionMenu = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const width = Math.min(192, window.innerWidth - 16);
    const estimatedHeight = canMakeCover ? 210 : 164;
    const openAbove =
      window.innerHeight - rect.bottom < estimatedHeight &&
      rect.top > estimatedHeight;

    setPosition({
      top: openAbove
        ? Math.max(8, rect.top - estimatedHeight - 8)
        : Math.min(window.innerHeight - estimatedHeight - 8, rect.bottom + 8),
      left: Math.max(
        8,
        Math.min(rect.right - width, window.innerWidth - width - 8),
      ),
    });
  };

  useEffect(() => {
    if (!isOpen) return;

    const closeMenu = (event?: Event) => {
      if (
        event?.target instanceof Node &&
        (menuRef.current?.contains(event.target) ||
          triggerRef.current?.contains(event.target))
      ) {
        return;
      }
      setIsOpen(false);
    };

    document.addEventListener("pointerdown", closeMenu, true);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      document.removeEventListener("pointerdown", closeMenu, true);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [isOpen]);

  const runAction = (action: () => void) => {
    setIsOpen(false);
    action();
  };

  return (
    <div className="photo-actions-dropdown-wrap">
      <button
        ref={triggerRef}
        type="button"
        className="photo-actions-trigger"
        aria-label={`Actions for ${label}`}
        aria-controls={menuId}
        aria-expanded={isOpen}
        onClick={() => {
          if (isOpen) {
            setIsOpen(false);
            return;
          }
          positionMenu();
          setIsOpen(true);
        }}
      >
        <span aria-hidden="true">•••</span>
      </button>
      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              className="photo-actions-dropdown"
              role="menu"
              aria-label={`Actions for ${label}`}
              style={position}
            >
              <button
                type="button"
                role="menuitem"
                disabled={!canMoveEarlier || disabled}
                onClick={() => runAction(onMoveEarlier)}
              >
                Move earlier
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!canMoveLater || disabled}
                onClick={() => runAction(onMoveLater)}
              >
                Move later
              </button>
              {canMakeCover ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={disabled}
                  onClick={() => runAction(onMakeCover)}
                >
                  Make cover
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="photo-actions-dropdown__delete"
                disabled={disabled}
                onClick={() => runAction(onDelete)}
              >
                Delete
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

type UploadAttemptResult = "ready" | "failed" | "pending";

interface ReservedPhotoUpload {
  readonly item: UploadItem;
  readonly reservation: EventPhotoReservationDto;
}

interface TransferredPhotoUpload {
  readonly reserved: ReservedPhotoUpload;
  readonly pathname: string;
}

const PHOTO_RECONCILIATION_ATTEMPTS = 3;
const PHOTO_RECONCILIATION_DELAY_MS = 750;
const PHOTO_RECONCILIATION_REQUEST_TIMEOUT_MS = 5_000;
const MAX_PARALLEL_PHOTO_TRANSFERS = 3;

function formatListingDate(
  startsAt: string | null,
  localStartsAt: string | null,
  timeZone: string | null,
): string {
  if (startsAt) {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: timeZone ?? "America/Los_Angeles",
    }).format(new Date(startsAt));
  }
  const date = localStartsAt?.split("T")[0];
  if (!date) return "Not set";
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

const SCHEDULE_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function localDateKey(value: string | null | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
    ? value.slice(0, 10)
    : null;
}

function localTimeValue(
  value: string | null | undefined,
  fallback: string,
): string {
  return value && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
    ? value.slice(11)
    : fallback;
}

function calendarDateFromKey(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function calendarDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${String(year)}-${month}-${day}`;
}

function formatScheduleDate(value: string | null | undefined): string {
  const date = calendarDateFromKey(localDateKey(value));
  return date
    ? new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(date)
    : "Select a date";
}

function formatScheduleTime(value: string): string {
  const [hour, minute] = value.split(":").map(Number);
  if (hour === undefined || minute === undefined) return value;
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2000, 0, 1, hour, minute));
}

const STEP_LABELS: Readonly<Record<EventWizardStep, string>> = {
  details: "Details",
  schedule: "Schedule",
  location: "Privacy",
  photos: "Photos",
  review: "Review",
};

const ACCEPTED_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const MAX_EVENT_PHOTOS = 150;
const LocationConfirmationMap = dynamic(
  () => import("@/features/location/location-confirmation-map"),
  {
    ssr: false,
    loading: () => (
      <div className="location-map-fallback" role="status">
        Loading confirmation map...
      </div>
    ),
  },
);

const UPLOAD_STATUS_LABELS: Readonly<Record<UploadStatus, string>> = {
  selected: "Selected",
  reserving: "Reserving",
  uploading: "Uploading",
  processing: "Processing photo",
  ready: "Ready",
  failed: "Failed",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadPreview({ item }: { readonly item: UploadItem }) {
  const [failedSource, setFailedSource] = useState("");
  if (failedSource === item.previewUrl) {
    return <div className="upload-preview-fallback">Preview unavailable</div>;
  }
  return (
    // This is a short-lived local object URL, not a public or raw Blob URL.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="upload-preview"
      src={item.previewUrl}
      alt={`${item.previewIsLocal ? "Selected preview" : "Processed thumbnail"} for ${item.fileName}`}
      onError={() => setFailedSource(item.previewUrl)}
    />
  );
}

function requestError(
  result: {
    readonly error?: string;
    readonly code?: string;
    readonly requestId?: string;
  },
  fallback: string,
): Error {
  if (result.code === "STALE_VERSION") {
    return new StaleVersionError(result.requestId);
  }
  const message = result.error ?? fallback;
  return new ApiRequestError(
    result.requestId ? `${message} Request: ${result.requestId}.` : message,
    result.code,
  );
}

class ApiRequestError extends Error {
  override readonly name = "ApiRequestError";

  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

class StaleVersionError extends Error {
  constructor(requestId?: string) {
    super(
      requestId
        ? `This draft was updated while you were working. We refreshed it and can safely retry your change. Request: ${requestId}.`
        : "This draft was updated while you were working. We refreshed it and can safely retry your change.",
    );
    this.name = "StaleVersionError";
  }
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
  const router = useRouter();
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
      router.push(`/dashboard/events/${result.event.id}/edit`);
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
      <button type="submit" aria-busy={pending} disabled={pending}>
        {pending ? "Creating…" : "Create event"}
      </button>
      <p aria-live="polite">{message}</p>
    </form>
  );
}

export function EventBuilder({
  initialEvent,
  termsVersion,
  accountEmail,
  initialEmailVerified,
}: {
  readonly initialEvent: EventEditorDto;
  readonly termsVersion: string;
  readonly accountEmail: string;
  readonly initialEmailVerified: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(initialEvent);
  const draftRef = useRef(initialEvent);
  const controllers = useRef(new Set<AbortController>());
  const [step, setStep] = useState<EventWizardStep>(() =>
    resumeEventWizardStep(initialEvent.steps),
  );
  const [pending, setPending] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [emailVerified, setEmailVerified] = useState(initialEmailVerified);
  const [verificationPending, setVerificationPending] = useState<
    "" | "send" | "check"
  >("");
  const [verificationMessage, setVerificationMessage] = useState("");
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
  const timezone = "America/Los_Angeles";
  const [scheduleStartTime, setScheduleStartTime] = useState(() =>
    localTimeValue(initialEvent.localStartsAt, "09:00"),
  );
  const [scheduleEndTime, setScheduleEndTime] = useState(() =>
    localTimeValue(initialEvent.localEndsAt, "16:00"),
  );
  const [activeScheduleTimePicker, setActiveScheduleTimePicker] = useState<
    "start" | "end" | null
  >(null);
  const [scheduleMonth, setScheduleMonth] = useState(() => {
    const initialDate = calendarDateFromKey(
      localDateKey(initialEvent.localStartsAt),
    );
    const month = initialDate ?? new Date();
    return new Date(month.getFullYear(), month.getMonth(), 1);
  });
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
  const [privacyMode, setPrivacyMode] = useState<AddressPrivacyMode>(
    initialEvent.privacyMode ?? "HIDDEN_UNTIL_START",
  );
  const [addressQuery, setAddressQuery] = useState(
    initialEvent.location?.normalizedAddress ??
      initialEvent.location?.addressLine1 ??
      "",
  );
  const [selectionToken, setSelectionToken] = useState<string | null>(null);
  const [selectedAddress, setSelectedAddress] =
    useState<ClientAddressSuggestion | null>(null);
  const [selectedCoordinates, setSelectedCoordinates] = useState<{
    readonly latitude: number;
    readonly longitude: number;
  } | null>(
    initialEvent.location?.latitude !== null &&
      initialEvent.location?.latitude !== undefined &&
      initialEvent.location.longitude !== null &&
      initialEvent.location.longitude !== undefined
      ? {
          latitude: initialEvent.location.latitude,
          longitude: initialEvent.location.longitude,
        }
      : null,
  );
  const [locationConfirmed, setLocationConfirmed] = useState(
    initialEvent.location?.confirmationStatus === "CONFIRMED",
  );
  const [locationAddressError, setLocationAddressError] = useState("");
  const [uploads, setUploads] = useState<readonly UploadItem[]>([]);
  const [uploadActive, setUploadActive] = useState(false);
  const [photoDragState, setPhotoDragState] = useState<
    "idle" | "valid" | "invalid"
  >("idle");
  const uploadActiveRef = useRef(false);
  const operationActiveRef = useRef(false);
  const photoDragDepth = useRef(0);
  const previewUrls = useRef(new Set<string>());
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousStepRef = useRef(step);

  useEffect(
    () => () => {
      for (const controller of controllers.current) controller.abort();
      controllers.current.clear();
      for (const url of previewUrls.current) URL.revokeObjectURL(url);
      previewUrls.current.clear();
    },
    [],
  );

  useEffect(() => {
    if (previousStepRef.current === step) return;
    previousStepRef.current = step;
    stepHeadingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (emailVerified) return;
    const controller = new AbortController();
    const checkAfterFocus = () => {
      if (document.visibilityState === "hidden") return;
      void jsonRequest<AccountResponse>(
        "/api/account",
        "GET",
        undefined,
        controller.signal,
      )
        .then((result) => {
          if (result.account?.emailVerified) {
            setEmailVerified(true);
            setVerificationMessage(
              "Email verified. You can now approve this event.",
            );
          }
        })
        .catch(() => {
          // The manual status action remains available if a focus check fails.
        });
    };
    window.addEventListener("focus", checkAfterFocus);
    document.addEventListener("visibilitychange", checkAfterFocus);
    return () => {
      controller.abort();
      window.removeEventListener("focus", checkAfterFocus);
      document.removeEventListener("visibilitychange", checkAfterFocus);
    };
  }, [emailVerified]);

  function syncForms(event: EventEditorDto) {
    setTitle(event.title ?? "");
    setDescription(event.description ?? "");
    setLocalStartsAt(event.localStartsAt ?? "");
    setLocalEndsAt(event.localEndsAt ?? "");
    setScheduleStartTime(localTimeValue(event.localStartsAt, "09:00"));
    setScheduleEndTime(localTimeValue(event.localEndsAt, "16:00"));
    setAddressLine1(event.location?.addressLine1 ?? "");
    setAddressLine2(event.location?.addressLine2 ?? "");
    setCity(event.location?.city ?? "Bakersfield");
    setRegion(event.location?.region ?? "California");
    setPostalCode(event.location?.postalCode ?? "");
    setCountryCode(event.location?.countryCode ?? "US");
    setAddressQuery(
      event.location?.normalizedAddress ?? event.location?.addressLine1 ?? "",
    );
    setSelectionToken(null);
    setSelectedAddress(null);
    setLocationAddressError("");
    setSelectedCoordinates(
      event.location?.latitude !== null &&
        event.location?.latitude !== undefined &&
        event.location.longitude !== null &&
        event.location.longitude !== undefined
        ? {
            latitude: event.location.latitude,
            longitude: event.location.longitude,
          }
        : null,
    );
    setLocationConfirmed(event.location?.confirmationStatus === "CONFIRMED");
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

  function beginOperation(name: string): boolean {
    if (operationActiveRef.current) return false;
    operationActiveRef.current = true;
    setPending(name);
    return true;
  }

  function finishOperation() {
    operationActiveRef.current = false;
    setPending("");
  }

  async function saveStep(
    target: EventWizardStep,
    endpoint: string,
    method: string,
    body: Record<string, unknown>,
    complete: (event: EventEditorDto) => boolean,
    next: EventWizardStep,
    allowIncompleteAdvance = false,
  ) {
    if (!beginOperation(target)) return;
    setConfirmation("");
    setStepFeedback(target, { kind: "success", text: "" });
    try {
      let response: EventResponse;
      try {
        response = await request<EventResponse>(endpoint, method, body);
      } catch (error) {
        if (!(error instanceof StaleVersionError)) throw error;
        setStepFeedback(target, {
          kind: "success",
          text: "Your draft was updated in the background. Refreshing the latest version and saving your changes…",
        });
        const latest = await refreshEvent();
        response = await request<EventResponse>(endpoint, method, {
          ...body,
          expectedVersion: latest.version,
        });
      }
      acceptEvent(response.event);
      if (!complete(response.event)) {
        setStepFeedback(target, {
          kind: allowIncompleteAdvance ? "success" : "error",
          text:
            response.event.readiness.missing.find((message) =>
              target === "details"
                ? message.includes("private street address")
                : target === "location"
                  ? /address|privacy/i.test(message)
                  : false,
            ) ??
            (allowIncompleteAdvance
              ? "Draft saved. Confirm the address before approval or payment."
              : "The server saved the values but this step is still incomplete."),
        });
        if (allowIncompleteAdvance) setStep(next);
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
      finishOperation();
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
    if (!localStartsAt || !localEndsAt) {
      setStepFeedback("schedule", {
        kind: "error",
        text: "Choose both a start and end date before saving.",
      });
      return;
    }
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

  function updateScheduleStartTime(value: string) {
    setScheduleStartTime(value);
    const date = localDateKey(localStartsAt);
    if (date) setLocalStartsAt(`${date}T${value}`);
  }

  function updateScheduleEndTime(value: string) {
    setScheduleEndTime(value);
    const date = localDateKey(localEndsAt);
    if (date) setLocalEndsAt(`${date}T${value}`);
  }

  function chooseScheduleDate(date: Date) {
    const selectedDate = calendarDateKey(date);
    const currentStart = localDateKey(localStartsAt);
    const currentEnd = localDateKey(localEndsAt);

    if (!currentStart || currentEnd) {
      setLocalStartsAt(`${selectedDate}T${scheduleStartTime}`);
      setLocalEndsAt("");
      return;
    }

    if (selectedDate < currentStart) {
      setLocalStartsAt(`${selectedDate}T${scheduleStartTime}`);
      return;
    }

    setLocalEndsAt(`${selectedDate}T${scheduleEndTime}`);
  }

  function changeScheduleMonth(offset: number) {
    setScheduleMonth(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + offset, 1),
    );
  }

  function changeAddressQuery(value: string) {
    setAddressQuery(value);
    setAddressLine1(value);
    setSelectionToken(null);
    setSelectedAddress(null);
    setSelectedCoordinates(null);
    setLocationConfirmed(false);
    setLocationAddressError("");
  }

  function selectAddress(suggestion: ClientAddressSuggestion) {
    setSelectedAddress(suggestion);
    setAddressQuery(suggestion.formattedAddress);
    setAddressLine1(`${suggestion.houseNumber} ${suggestion.street}`);
    setCity(suggestion.city);
    setRegion(suggestion.state);
    setPostalCode(suggestion.postalCode);
    setCountryCode(suggestion.countryCode);
    setSelectionToken(suggestion.selectionToken);
    setSelectedCoordinates({
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
    });
    setLocationConfirmed(false);
    setLocationAddressError("");
  }

  function saveLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const currentLocation = draftRef.current.location;
    const hasSavedConfirmedAddress =
      currentLocation?.confirmationStatus === "CONFIRMED" &&
      currentLocation.latitude !== null &&
      currentLocation.longitude !== null;

    if (!selectedAddress && !hasSavedConfirmedAddress) {
      const text = "Select an address from the results to continue.";
      setLocationAddressError(text);
      setStepFeedback("location", { kind: "error", text });
      return;
    }

    if (!locationConfirmed) {
      const text = "Confirm this is the sale property.";
      setStepFeedback("location", { kind: "error", text });
      return;
    }

    setLocationAddressError("");
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
        timezone,
        privacyMode,
        selectionToken,
        confirmed: locationConfirmed,
      },
      (saved) => saved.steps.locationComplete,
      "photos",
    );
  }

  function queuePhotos(selected: readonly File[]) {
    if (
      operationActiveRef.current ||
      uploadActiveRef.current ||
      selected.length === 0
    ) {
      return;
    }
    const remainingCapacity = Math.max(
      0,
      MAX_EVENT_PHOTOS - draftRef.current.photos.length,
    );
    let acceptedForCapacity = 0;
    const items = selected.map<UploadItem>((file) => {
      let error = !ACCEPTED_PHOTO_TYPES.has(file.type)
        ? "Unsupported format. Choose JPEG, PNG, WebP, HEIC, or HEIF."
        : file.size <= 0
          ? "This file is empty."
          : file.size > MAX_PHOTO_BYTES
            ? "This file exceeds the 15 MB limit."
            : undefined;
      if (!error && acceptedForCapacity >= remainingCapacity) {
        error = `This sale already has the maximum of ${String(MAX_EVENT_PHOTOS)} photos.`;
      }
      if (!error) acceptedForCapacity += 1;
      return {
        id: crypto.randomUUID(),
        file,
        fileName: file.name,
        fileSize: file.size,
        previewUrl: URL.createObjectURL(file),
        previewIsLocal: true,
        status: error ? "failed" : "selected",
        progress: 0,
        retryable: false,
        error,
      };
    });
    for (const item of items) previewUrls.current.add(item.previewUrl);
    setUploads((current) => [...current, ...items]);
    void uploadSelected(items);
  }

  function choosePhotos(event: ChangeEvent<HTMLInputElement>) {
    const selected = [...(event.currentTarget.files ?? [])];
    event.currentTarget.value = "";
    queuePhotos(selected);
  }

  function photoDragEnter(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (operationActiveRef.current || uploadActiveRef.current) return;
    photoDragDepth.current += 1;
    const files = [...event.dataTransfer.items].filter(
      (item) => item.kind === "file",
    );
    setPhotoDragState(
      files.length > 0 &&
        files.every((item) => !item.type || ACCEPTED_PHOTO_TYPES.has(item.type))
        ? "valid"
        : "invalid",
    );
  }

  function photoDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect =
      photoDragState === "invalid" ? "none" : "copy";
  }

  function photoDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    photoDragDepth.current = Math.max(0, photoDragDepth.current - 1);
    if (photoDragDepth.current === 0) setPhotoDragState("idle");
  }

  function dropPhotos(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    photoDragDepth.current = 0;
    setPhotoDragState("idle");
    queuePhotos([...event.dataTransfer.files]);
  }

  function updateUpload(id: string, changes: Partial<UploadItem>) {
    setUploads((current) =>
      current.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );
  }

  async function refreshEvent(timeoutMs = 25_000) {
    const response = await request<EventResponse>(
      `/api/events/${draftRef.current.id}`,
      "GET",
      undefined,
      timeoutMs,
    );
    acceptEvent(response.event);
    return response.event;
  }

  function releaseLocalPreview(item: UploadItem) {
    if (!item.previewIsLocal || !previewUrls.current.delete(item.previewUrl)) {
      return;
    }
    window.setTimeout(() => URL.revokeObjectURL(item.previewUrl), 0);
  }

  function markUploadReady(
    item: UploadItem,
    photoId: string,
    event: EventEditorDto,
  ): boolean {
    const photo = event.photos.find(
      (candidate) => candidate.id === photoId && candidate.status === "READY",
    );
    if (!photo) return false;
    updateUpload(item.id, {
      file: undefined,
      previewUrl: photo.urls.thumbnail,
      previewIsLocal: false,
      status: "ready",
      progress: 100,
      retryable: false,
      photoId,
      error: undefined,
    });
    releaseLocalPreview(item);
    return true;
  }

  async function waitForPhotoReconciliation() {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, PHOTO_RECONCILIATION_DELAY_MS);
    });
  }

  async function reconcilePhotoAfterFailure(
    photoId: string,
    finalizeAttempted: boolean,
  ): Promise<"ready" | "retryable" | "pending"> {
    for (
      let attempt = 0;
      attempt < PHOTO_RECONCILIATION_ATTEMPTS;
      attempt += 1
    ) {
      try {
        const event = await refreshEvent(
          PHOTO_RECONCILIATION_REQUEST_TIMEOUT_MS,
        );
        const photo = event.photos.find(
          (candidate) => candidate.id === photoId,
        );
        if (photo?.status === "READY") return "ready";
        if (photo?.status === "FAILED") return "retryable";
        if (!finalizeAttempted && photo?.status === "RESERVED") {
          try {
            await cleanupReservation(photoId);
            return "retryable";
          } catch {
            return "pending";
          }
        }
      } catch {
        // A transient read failure is ambiguous; never make Retry available from it.
      }
      if (attempt + 1 < PHOTO_RECONCILIATION_ATTEMPTS) {
        await waitForPhotoReconciliation();
      }
    }
    return "pending";
  }

  async function cleanupReservation(photoId: string) {
    const response = await request<EventResponse>(
      `/api/events/${draftRef.current.id}/photos/${photoId}`,
      "DELETE",
      { expectedVersion: draftRef.current.version },
    );
    acceptEvent(response.event);
  }

  async function reserveUpload(
    item: UploadItem,
  ): Promise<ReservedPhotoUpload | undefined> {
    const file = item.file;
    if (!file) {
      updateUpload(item.id, {
        status: "failed",
        progress: 0,
        retryable: false,
        error: "Select this file again before retrying.",
      });
      return undefined;
    }
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
        progress: 5,
        retryable: false,
        error: undefined,
      });
      const reserved = await request<ReservationResponse>(
        `/api/events/${draftRef.current.id}/photos/reserve`,
        "POST",
        {
          expectedVersion: draftRef.current.version,
          contentType: file.type,
          fileName: item.fileName,
        },
      );
      acceptEvent(reserved.reservation.event);
      return { item, reservation: reserved.reservation };
    } catch (error) {
      updateUpload(item.id, {
        status: "failed",
        progress: 0,
        retryable: true,
        error: error instanceof Error ? error.message : "Photo upload failed.",
      });
      return undefined;
    }
  }

  async function transferReservedUpload(
    reserved: ReservedPhotoUpload,
    expectedVersion: number,
  ): Promise<TransferredPhotoUpload | undefined> {
    const { item, reservation } = reserved;
    const file = item.file;
    if (!file) return undefined;
    updateUpload(item.id, {
      status: "uploading",
      progress: 10,
      retryable: false,
      photoId: reservation.photoId,
      error: undefined,
    });
    const controller = new AbortController();
    controllers.current.add(controller);
    let uploadTimedOut = false;
    const timer = window.setTimeout(() => {
      uploadTimedOut = true;
      controller.abort();
    }, photoUploadTimeoutMs(file.size));
    try {
      let pathname: string;
      if (reservation.transport === "vercel-client") {
        const uploaded = await uploadPrivateMedia({
          pathname: reservation.uploadPathname,
          file,
          handleUploadUrl: `/api/events/${draftRef.current.id}/photos/upload`,
          clientPayload: JSON.stringify({
            expectedVersion,
            reservationId: reservation.reservationId,
            photoId: reservation.photoId,
          }),
          contentType: file.type,
          abortSignal: controller.signal,
          onProgress(percentage) {
            updateUpload(item.id, {
              progress: Math.min(90, 10 + Math.round(percentage * 0.8)),
            });
          },
        });
        pathname = uploaded.pathname;
      } else {
        const upload = await fetch(reservation.uploadUrl, {
          method: reservation.method,
          headers: {
            ...reservation.uploadHeaders,
            "Content-Type": file.type,
          },
          body: file,
          signal: controller.signal,
        });
        if (!upload.ok) {
          throw new Error(
            `The isolated test upload failed (${String(upload.status)}).`,
          );
        }
        pathname = reservation.uploadPathname;
      }
      if (pathname !== reservation.uploadPathname) {
        throw new Error("The uploaded Blob did not match its reservation.");
      }
      updateUpload(item.id, { status: "uploading", progress: 90 });
      updateUpload(item.id, {
        status: "processing",
        progress: 95,
        retryable: false,
      });
      return { reserved, pathname };
    } catch (error) {
      const message = uploadTimedOut
        ? "Upload timed out before the Blob transfer completed. Check your connection and retry."
        : error instanceof Error
          ? error.message
          : "Photo upload failed.";
      updateUpload(item.id, {
        status: "failed",
        progress: 0,
        retryable: true,
        photoId: reservation.photoId,
        error: message,
      });
      return undefined;
    } finally {
      window.clearTimeout(timer);
      controllers.current.delete(controller);
    }
  }

  async function finalizeTransferredUpload(
    transfer: TransferredPhotoUpload,
  ): Promise<UploadAttemptResult> {
    const { item, reservation } = transfer.reserved;
    const photoId = reservation.photoId;
    let finalizeAttempted = false;
    try {
      finalizeAttempted = true;
      const completed = await request<EventResponse>(
        `/api/events/${draftRef.current.id}/photos/${photoId}/finalize`,
        "POST",
        {
          expectedVersion: draftRef.current.version,
          reservationId: reservation.reservationId,
          pathname: transfer.pathname,
        },
        90_000,
      );
      acceptEvent(completed.event);
      if (
        !completed.event.photos.some(
          (photo) => photo.id === photoId && photo.status === "READY",
        ) ||
        !markUploadReady(item, photoId, completed.event)
      ) {
        throw new Error(
          "Image processing failed. The server did not provide a ready photo.",
        );
      }
      return "ready";
    } catch (error) {
      const reconciliation = await reconcilePhotoAfterFailure(
        photoId,
        finalizeAttempted,
      );
      if (
        reconciliation === "ready" &&
        markUploadReady(item, photoId, draftRef.current)
      ) {
        return "ready";
      }
      if (reconciliation === "pending" || reconciliation === "ready") {
        updateUpload(item.id, {
          status: "processing",
          progress: 95,
          retryable: false,
          photoId,
          error:
            "Server processing is still being confirmed. Reload before taking another action; retry is disabled to prevent a duplicate photo.",
        });
        return "pending";
      }
      updateUpload(item.id, {
        status: "failed",
        progress: 0,
        retryable: true,
        photoId,
        error: error instanceof Error ? error.message : "Photo upload failed.",
      });
      return "failed";
    }
  }

  async function uploadSelected(batch: readonly UploadItem[]) {
    if (
      uploadActiveRef.current ||
      batch.length === 0 ||
      !beginOperation("photos")
    ) {
      return;
    }
    uploadActiveRef.current = true;
    setUploadActive(true);
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
          Boolean(item.file) &&
          (item.status === "selected" || item.retryable),
      );
      const reserved: ReservedPhotoUpload[] = [];
      for (const item of candidates) {
        const reservation = await reserveUpload(item);
        if (reservation) reserved.push(reservation);
      }
      const transferVersion = draftRef.current.version;
      const transfers: Array<TransferredPhotoUpload | undefined> = Array(
        reserved.length,
      );
      let nextTransferIndex = 0;
      await Promise.all(
        Array.from(
          { length: Math.min(MAX_PARALLEL_PHOTO_TRANSFERS, reserved.length) },
          async () => {
            while (nextTransferIndex < reserved.length) {
              const index = nextTransferIndex;
              nextTransferIndex += 1;
              const reservation = reserved[index];
              if (!reservation) continue;
              transfers[index] = await transferReservedUpload(
                reservation,
                transferVersion,
              );
            }
          },
        ),
      );

      let succeeded = 0;
      let failed =
        batch.length - candidates.length + candidates.length - reserved.length;
      let awaitingConfirmation = 0;
      for (const transfer of transfers) {
        if (!transfer) {
          failed += 1;
          continue;
        }
        const result = await finalizeTransferredUpload(transfer);
        if (result === "ready") succeeded += 1;
        else if (result === "pending") awaitingConfirmation += 1;
        else failed += 1;
      }
      try {
        await refreshEvent();
      } catch {
        // Each ambiguous per-file failure already attempted reconciliation.
      }
      const text = photoBatchSummary({
        succeeded,
        failed,
        pending: awaitingConfirmation,
        hadReadyCover,
        hadReadyPhotos,
        hasReadyCover: draftRef.current.photos.some(
          (photo) => photo.status === "READY" && photo.isCover,
        ),
      });
      setStepFeedback("photos", {
        kind: failed > 0 || awaitingConfirmation > 0 ? "error" : "success",
        text,
      });
    } finally {
      setUploadActive(false);
      uploadActiveRef.current = false;
      finishOperation();
    }
  }

  async function mutatePhoto(
    name: string,
    endpoint: string,
    method: string,
    body: object,
  ) {
    if (!beginOperation(name)) return;
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
      finishOperation();
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

  function movePhoto(photoId: string, direction: -1 | 1) {
    const photoIds = draftRef.current.photos.map((photo) => photo.id);
    const currentIndex = photoIds.indexOf(photoId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= photoIds.length) {
      return;
    }
    const reordered = [...photoIds];
    const [moved] = reordered.splice(currentIndex, 1);
    if (!moved) return;
    reordered.splice(nextIndex, 0, moved);
    void mutatePhoto(
      "photo-order",
      `/api/events/${draftRef.current.id}/photos/order`,
      "PUT",
      { expectedVersion: draftRef.current.version, photoIds: reordered },
    );
  }

  function dismissUpload(item: UploadItem) {
    setUploads((current) =>
      current.filter((candidate) => candidate.id !== item.id),
    );
    releaseLocalPreview(item);
  }

  async function removeUpload(item: UploadItem) {
    if (uploadActiveRef.current || operationActiveRef.current) return;
    const persistedPhoto = item.photoId
      ? draftRef.current.photos.find((photo) => photo.id === item.photoId)
      : undefined;
    const dismissOnly =
      item.status === "ready" ||
      item.status === "processing" ||
      persistedPhoto?.status === "READY" ||
      persistedPhoto?.status === "PROCESSING" ||
      persistedPhoto?.status === "UPLOADED";
    if (!persistedPhoto || dismissOnly) {
      dismissUpload(item);
      return;
    }
    if (!beginOperation(`remove-upload:${item.id}`)) return;
    try {
      await cleanupReservation(persistedPhoto.id);
      dismissUpload(item);
      setStepFeedback("photos", {
        kind: "success",
        text: "The abandoned upload was removed.",
      });
    } catch (error) {
      setStepFeedback("photos", {
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "The photo could not be removed.",
      });
    } finally {
      finishOperation();
    }
  }

  async function continueFromPhotos() {
    if (!beginOperation("photos-continue")) return;
    try {
      const event = await refreshEvent();
      if (!event.steps.photosComplete) {
        setStepFeedback("photos", {
          kind: "error",
          text: "Upload at least one photo that finishes processing and choose a cover.",
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
      finishOperation();
    }
  }

  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!emailVerified) {
      setStepFeedback("review", {
        kind: "error",
        text: "Verify your email before approving this event.",
      });
      return;
    }
    const data = new FormData(event.currentTarget);
    if (data.get("acceptedTerms") !== "yes") {
      setStepFeedback("review", {
        kind: "error",
        text: "Accept the publishing terms before approval.",
      });
      return;
    }
    if (!beginOperation("approval")) return;
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
      router.push(`/dashboard/events/${response.event.id}/payment`);
    } catch (error) {
      if (
        error instanceof ApiRequestError &&
        error.code === "EMAIL_VERIFICATION_REQUIRED"
      ) {
        setEmailVerified(false);
      }
      setStepFeedback("review", {
        kind: "error",
        text: error instanceof Error ? error.message : "Approval failed.",
      });
    } finally {
      finishOperation();
    }
  }

  async function sendVerificationEmail() {
    if (verificationPending) return;
    setVerificationPending("send");
    setVerificationMessage("");
    try {
      await request<MessageResponse>("/api/auth/resend-verification", "POST", {
        email: accountEmail,
      });
      setVerificationMessage(
        `Verification email sent to ${accountEmail}. Open the link, then return here.`,
      );
    } catch (error) {
      setVerificationMessage(
        error instanceof Error
          ? error.message
          : "The verification email could not be sent. Try again.",
      );
    } finally {
      setVerificationPending("");
    }
  }

  async function checkVerificationStatus() {
    if (verificationPending) return;
    setVerificationPending("check");
    setVerificationMessage("");
    try {
      const result = await request<AccountResponse>("/api/account");
      const verified = Boolean(result.account?.emailVerified);
      setEmailVerified(verified);
      setVerificationMessage(
        verified
          ? "Email verified. You can now approve this event."
          : "Your email is not verified yet. Open the link we sent, then check again.",
      );
    } catch (error) {
      setVerificationMessage(
        error instanceof Error
          ? error.message
          : "Verification status could not be checked. Try again.",
      );
    } finally {
      setVerificationPending("");
    }
  }

  const completed = completedWizardSteps(draft.steps);
  const currentFeedback = feedback[step];
  const readyPhotoCount = draft.photos.filter(
    (photo) => photo.status === "READY",
  ).length;
  const hasReadyCover = draft.photos.some(
    (photo) => photo.status === "READY" && photo.isCover,
  );
  const approvalIsCurrent =
    !draft.publication &&
    draft.workflowState === "APPROVED_FOR_PAYMENT" &&
    draft.approvalStatus === "APPROVED" &&
    draft.approvedRevision === draft.contentRevision &&
    Boolean(
      draft.approvalDigest &&
      draft.approvedAt &&
      draft.termsVersion &&
      draft.termsAcceptedAt,
    );
  const coverPhoto = draft.photos.find(
    (photo) => photo.status === "READY" && photo.isCover,
  );
  const coverPhotoIndex = coverPhoto
    ? draft.photos.findIndex((photo) => photo.id === coverPhoto.id)
    : -1;
  const additionalPhotos = draft.photos.filter((photo) => !photo.isCover);
  const savedAddressIsConfirmed =
    draft.location?.confirmationStatus === "CONFIRMED" &&
    draft.location.latitude !== null &&
    draft.location.longitude !== null;
  const completionItems = [
    { label: "Add sale details", complete: draft.steps.detailsComplete },
    { label: "Set the schedule", complete: draft.steps.scheduleComplete },
    {
      label: "Confirm location privacy",
      complete: draft.steps.locationComplete,
    },
    {
      label: "Upload and select a cover",
      complete: draft.steps.photosComplete,
    },
    {
      label: "Review and approve",
      complete: approvalIsCurrent || Boolean(draft.publication),
    },
  ];

  function persistedUploadPhoto(item: UploadItem) {
    return item.photoId
      ? draft.photos.find((photo) => photo.id === item.photoId)
      : undefined;
  }

  function uploadDismissesLocally(item: UploadItem): boolean {
    const photo = persistedUploadPhoto(item);
    return (
      item.status === "ready" ||
      item.status === "processing" ||
      photo?.status === "READY" ||
      photo?.status === "PROCESSING" ||
      photo?.status === "UPLOADED"
    );
  }

  function uploadCanRetry(item: UploadItem): boolean {
    const photo = persistedUploadPhoto(item);
    return Boolean(
      item.status === "failed" &&
      item.retryable &&
      item.file &&
      (!photo || photo.status === "FAILED"),
    );
  }

  const uploadReadyCount = uploads.filter(
    (item) => item.status === "ready",
  ).length;
  const uploadFailedCount = uploads.filter(
    (item) => item.status === "failed",
  ).length;
  const uploadInFlightCount = uploads.filter((item) =>
    ["selected", "reserving", "uploading", "processing"].includes(item.status),
  ).length;
  const scheduleStartDate = calendarDateFromKey(localDateKey(localStartsAt));
  const scheduleEndDate = calendarDateFromKey(localDateKey(localEndsAt));
  const scheduleCalendarStart = new Date(
    scheduleMonth.getFullYear(),
    scheduleMonth.getMonth(),
    1 - scheduleMonth.getDay(),
  );
  const scheduleDays = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(scheduleCalendarStart);
    day.setDate(scheduleCalendarStart.getDate() + index);
    return day;
  });
  const scheduleTimeOptions = Array.from({ length: 48 }, (_, index) => {
    const hour = String(Math.floor(index / 2)).padStart(2, "0");
    const minute = index % 2 === 0 ? "00" : "30";
    return `${hour}:${minute}`;
  });
  const uploadsByPhotoId = new Map(
    uploads.flatMap((upload) =>
      upload.photoId ? [[upload.photoId, upload] as const] : [],
    ),
  );
  const photoManagerRows: readonly PhotoManagerRow[] = [
    ...draft.photos.map((photo, photoIndex) => ({
      key: photo.id,
      upload: uploadsByPhotoId.get(photo.id),
      photo,
      photoIndex,
    })),
    ...uploads
      .filter((upload) => !upload.photoId)
      .map((upload) => ({
        key: upload.id,
        upload,
        photo: undefined,
        photoIndex: -1,
      })),
  ].sort(
    (left, right) =>
      Number(Boolean(right.photo?.isCover)) -
      Number(Boolean(left.photo?.isCover)),
  );
  const currentStepIndex = EVENT_WIZARD_STEPS.indexOf(step);
  const previousStep =
    currentStepIndex > 0 ? EVENT_WIZARD_STEPS[currentStepIndex - 1] : undefined;
  const nextStep = EVENT_WIZARD_STEPS[currentStepIndex + 1];
  const canAdvanceToNextStep = Boolean(
    nextStep && wizardStepAvailable(nextStep, draft.steps),
  );

  return (
    <div className="builder-layout">
      <div
        className="wizard-mobile-navigation"
        aria-label="Event builder navigation"
      >
        <button
          type="button"
          className="secondary-button"
          disabled={!previousStep || Boolean(pending) || uploadActive}
          onClick={() => previousStep && setStep(previousStep)}
        >
          Back
        </button>
        <button
          type="button"
          disabled={!canAdvanceToNextStep || Boolean(pending) || uploadActive}
          onClick={() => nextStep && setStep(nextStep)}
        >
          Next
        </button>
      </div>
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
              aria-label={STEP_LABELS[item]}
              aria-current={current ? "step" : undefined}
              onClick={() => setStep(item)}
            >
              <span className="wizard-step-number" aria-hidden="true">
                {completed[item] ? <Icon name="check" size={16} /> : index + 1}
              </span>
              <span className="wizard-step-copy">
                <strong>{STEP_LABELS[item]}</strong>
              </span>
            </button>
          );
        })}
      </nav>

      {confirmation ? (
        <p className="success-box" role="status">
          {confirmation}
        </p>
      ) : null}

      {approvalIsCurrent ? (
        <div className="warning-box builder-approval-warning" role="status">
          <strong>This exact revision is approved.</strong> Saving new details,
          schedule, location, or photo changes creates a new revision that must
          be reviewed and approved again.
        </div>
      ) : null}

      <div className="builder-workspace">
        <div className="builder-step-column">
          {step === "details" ? (
            <section className="builder-card" aria-labelledby="details-title">
              <p className="eyebrow">Step 1 of 5</p>
              <h2 id="details-title" ref={stepHeadingRef} tabIndex={-1}>
                Event details
              </h2>
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
            <section
              className="builder-card schedule-card"
              aria-labelledby="schedule-title"
            >
              <p className="eyebrow">Step 2 of 5</p>
              <div className="schedule-card__heading">
                <span
                  className="schedule-card__heading-icon"
                  aria-hidden="true"
                >
                  <Icon name="clock" size={24} />
                </span>
                <div>
                  <h2 id="schedule-title" ref={stepHeadingRef} tabIndex={-1}>
                    Schedule your sale
                  </h2>
                  <p>
                    Choose the sale dates and local hours. We’ll validate the
                    timezone and daylight-saving rules when you save.
                  </p>
                </div>
              </div>
              <form onSubmit={saveSchedule}>
                <div className="schedule-picker">
                  <section
                    className="schedule-calendar"
                    aria-label="Choose your sale dates"
                  >
                    <div className="schedule-calendar__header">
                      <button
                        type="button"
                        className="schedule-calendar__nav schedule-calendar__nav--previous"
                        aria-label="Previous month"
                        onClick={() => changeScheduleMonth(-1)}
                      >
                        <Icon name="chevron" size={26} />
                      </button>
                      <h3>
                        {new Intl.DateTimeFormat("en-US", {
                          month: "long",
                          year: "numeric",
                        }).format(scheduleMonth)}
                      </h3>
                      <button
                        type="button"
                        className="schedule-calendar__nav schedule-calendar__nav--next"
                        aria-label="Next month"
                        onClick={() => changeScheduleMonth(1)}
                      >
                        <Icon name="chevron" size={26} />
                      </button>
                    </div>
                    <div
                      className="schedule-calendar__weekdays"
                      aria-hidden="true"
                    >
                      {SCHEDULE_WEEKDAYS.map((weekday) => (
                        <span key={weekday}>{weekday}</span>
                      ))}
                    </div>
                    <div className="schedule-calendar__days">
                      {scheduleDays.map((day) => {
                        const dayKey = calendarDateKey(day);
                        const startKey = localDateKey(localStartsAt);
                        const endKey = localDateKey(localEndsAt);
                        const isStart = dayKey === startKey;
                        const isEnd = dayKey === endKey;
                        const isInRange = Boolean(
                          startKey &&
                          endKey &&
                          dayKey > startKey &&
                          dayKey < endKey,
                        );
                        const isCurrentMonth =
                          day.getMonth() === scheduleMonth.getMonth();
                        const isToday = dayKey === calendarDateKey(new Date());

                        return (
                          <button
                            key={dayKey}
                            type="button"
                            className={[
                              "schedule-calendar__day",
                              !isCurrentMonth ? "is-outside-month" : "",
                              isToday ? "is-today" : "",
                              isStart ? "is-range-start" : "",
                              isEnd ? "is-range-end" : "",
                              isInRange ? "is-in-range" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            aria-label={new Intl.DateTimeFormat("en-US", {
                              weekday: "long",
                              month: "long",
                              day: "numeric",
                              year: "numeric",
                            }).format(day)}
                            aria-pressed={isStart || isEnd}
                            onClick={() => chooseScheduleDate(day)}
                          >
                            <span>{day.getDate()}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section
                    className="schedule-details"
                    aria-label="Sale schedule details"
                  >
                    <div className="schedule-date-field">
                      <span>Start date*</span>
                      <div>
                        <strong>{formatScheduleDate(localStartsAt)}</strong>
                        <button
                          type="button"
                          className="schedule-time-trigger"
                          aria-expanded={activeScheduleTimePicker === "start"}
                          aria-haspopup="dialog"
                          aria-label={`Start time: ${formatScheduleTime(scheduleStartTime)}`}
                          onClick={() =>
                            setActiveScheduleTimePicker((current) =>
                              current === "start" ? null : "start",
                            )
                          }
                        >
                          {formatScheduleTime(scheduleStartTime)}
                          <Icon name="chevron" size={14} />
                        </button>
                        {activeScheduleTimePicker === "start" ? (
                          <div
                            className="schedule-time-popover"
                            role="dialog"
                            aria-label="Choose start time"
                          >
                            <div>
                              {scheduleTimeOptions.map((time) => (
                                <button
                                  key={time}
                                  type="button"
                                  className={
                                    time === scheduleStartTime
                                      ? "is-selected"
                                      : ""
                                  }
                                  onClick={() => {
                                    updateScheduleStartTime(time);
                                    setActiveScheduleTimePicker(null);
                                  }}
                                >
                                  {formatScheduleTime(time)}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="schedule-date-field">
                      <span>End date*</span>
                      <div>
                        <strong>{formatScheduleDate(localEndsAt)}</strong>
                        <button
                          type="button"
                          className="schedule-time-trigger"
                          aria-expanded={activeScheduleTimePicker === "end"}
                          aria-haspopup="dialog"
                          aria-label={`End time: ${formatScheduleTime(scheduleEndTime)}`}
                          onClick={() =>
                            setActiveScheduleTimePicker((current) =>
                              current === "end" ? null : "end",
                            )
                          }
                        >
                          {formatScheduleTime(scheduleEndTime)}
                          <Icon name="chevron" size={14} />
                        </button>
                        {activeScheduleTimePicker === "end" ? (
                          <div
                            className="schedule-time-popover"
                            role="dialog"
                            aria-label="Choose end time"
                          >
                            <div>
                              {scheduleTimeOptions.map((time) => (
                                <button
                                  key={time}
                                  type="button"
                                  className={
                                    time === scheduleEndTime
                                      ? "is-selected"
                                      : ""
                                  }
                                  onClick={() => {
                                    updateScheduleEndTime(time);
                                    setActiveScheduleTimePicker(null);
                                  }}
                                >
                                  {formatScheduleTime(time)}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <label className="schedule-timezone-field">
                      <span>Timezone</span>
                      <input
                        value={timezone}
                        aria-describedby="schedule-timezone-note"
                        readOnly
                      />
                    </label>
                    <p id="schedule-timezone-note">
                      Bakersfield schedules use Pacific Time automatically,
                      including daylight-saving rules.
                    </p>
                    <div className="schedule-summary" role="status">
                      {scheduleStartDate && scheduleEndDate
                        ? `Sale: ${formatScheduleDate(localStartsAt)} – ${formatScheduleDate(localEndsAt)}, ${formatScheduleTime(scheduleStartTime)} – ${formatScheduleTime(scheduleEndTime)}`
                        : scheduleStartDate
                          ? "Choose an end date to finish your sale schedule."
                          : "Select a start date to begin."}
                    </div>
                  </section>
                </div>
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
              <h2 id="location-title" ref={stepHeadingRef} tabIndex={-1}>
                Address and privacy
              </h2>
              <form onSubmit={saveLocation}>
                <AddressAutocomplete
                  value={addressQuery}
                  onChange={changeAddressQuery}
                  onSelect={selectAddress}
                  invalid={Boolean(locationAddressError)}
                  validationMessage={locationAddressError}
                />
                {selectedAddress ? (
                  <p
                    className="address-verification-status is-verified"
                    role="status"
                  >
                    Address selected. Confirm it below to continue.
                  </p>
                ) : savedAddressIsConfirmed ? (
                  <p
                    className="address-verification-status is-verified"
                    role="status"
                  >
                    Address selected. You can update the privacy setting and
                    continue.
                  </p>
                ) : (
                  <p className="address-verification-status">
                    Select an address from the results to continue.
                  </p>
                )}
                {selectedAddress || selectedCoordinates ? (
                  <section
                    className="selected-address-review"
                    aria-labelledby="selected-address-title"
                  >
                    <div>
                      <p className="eyebrow">Selected address</p>
                      <h3 id="selected-address-title">
                        {selectedAddress?.formattedAddress ??
                          initialEvent.location?.normalizedAddress ??
                          addressQuery}
                      </h3>
                      <p>Review the selected address and map.</p>
                    </div>
                    {selectedCoordinates ? (
                      <LocationConfirmationMap
                        latitude={selectedCoordinates.latitude}
                        longitude={selectedCoordinates.longitude}
                        label={
                          selectedAddress?.formattedAddress ?? addressQuery
                        }
                      />
                    ) : null}
                    <label className="location-confirmation-check">
                      <input
                        type="checkbox"
                        checked={locationConfirmed}
                        onChange={(event) => {
                          setLocationConfirmed(event.target.checked);
                          if (event.target.checked) {
                            setStepFeedback("location", {
                              kind: "success",
                              text: "Address confirmed. Save and continue.",
                            });
                          }
                        }}
                      />
                      I confirm this is the sale property.
                    </label>
                    <p className="location-attribution">
                      {selectedAddress?.provider.attribution ??
                        initialEvent.location?.providerAttribution}
                    </p>
                  </section>
                ) : (
                  <section className="unconfirmed-address-draft">
                    <p>Select an address from the results to continue.</p>
                    <div className="form-grid">
                      <label>
                        City
                        <input
                          value={city}
                          onChange={(event) => setCity(event.target.value)}
                          required
                        />
                      </label>
                      <label>
                        State
                        <input
                          value={region}
                          onChange={(event) => setRegion(event.target.value)}
                          required
                        />
                      </label>
                      <label>
                        Postal code (optional for draft)
                        <input
                          value={postalCode}
                          onChange={(event) =>
                            setPostalCode(event.target.value)
                          }
                        />
                      </label>
                      <label>
                        Country
                        <input
                          value={countryCode}
                          onChange={(event) =>
                            setCountryCode(event.target.value)
                          }
                          required
                        />
                      </label>
                    </div>
                  </section>
                )}
                <label>
                  Unit or suite (optional)
                  <input
                    value={addressLine2}
                    onChange={(event) => {
                      setAddressLine2(event.target.value);
                      setLocationConfirmed(false);
                    }}
                  />
                </label>
                <fieldset>
                  <legend>Privacy for this address</legend>
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
            <section
              className="builder-card builder-card--photos"
              aria-labelledby="photos-title"
            >
              <p className="eyebrow">Step 4 of 5</p>
              <h2 id="photos-title" ref={stepHeadingRef} tabIndex={-1}>
                Photos
              </h2>
              <p className="photo-step-intro">
                Select several images at once. Every file is validated before
                its private reservation, then sanitized and finalized
                independently.
              </p>
              <label
                className={`photo-dropzone photo-dropzone--${photoDragState}${draft.photos.length >= MAX_EVENT_PHOTOS ? " photo-dropzone--full" : ""}`}
                aria-disabled={draft.photos.length >= MAX_EVENT_PHOTOS}
                onDragEnter={photoDragEnter}
                onDragOver={photoDragOver}
                onDragLeave={photoDragLeave}
                onDrop={dropPhotos}
              >
                <input
                  className="photo-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  multiple
                  aria-label="Event photos (JPEG, PNG, WebP, HEIC, or HEIF; maximum 15 MB each)"
                  onChange={choosePhotos}
                  disabled={
                    Boolean(pending) ||
                    uploadActive ||
                    draft.photos.length >= MAX_EVENT_PHOTOS
                  }
                />
                <span className="photo-dropzone__icon" aria-hidden="true">
                  <Icon
                    name={photoDragState === "invalid" ? "warning" : "photo"}
                  />
                </span>
                <strong>
                  {draft.photos.length >= MAX_EVENT_PHOTOS
                    ? "Photo limit reached"
                    : photoDragState === "valid"
                      ? "Release to add photos"
                      : photoDragState === "invalid"
                        ? "Some files are not supported"
                        : "Drag and drop photos here"}
                </strong>
                <span className="photo-dropzone__desktop-copy">
                  or click to choose files
                </span>
                <span className="photo-dropzone__mobile-copy">
                  Tap to choose photos
                </span>
                <small>JPEG, PNG, WebP, HEIC, or HEIF · Max 15 MB each</small>
                <small>Up to {MAX_EVENT_PHOTOS} photos</small>
              </label>
              {uploads.length ? (
                <div className="upload-queue-region" hidden>
                  <p className="upload-queue-summary" role="status">
                    <Icon name="photo" size={18} />
                    <strong>{uploads.length} selected</strong>
                    {uploadReadyCount ? (
                      <span className="is-ready">{uploadReadyCount} ready</span>
                    ) : null}
                    {uploadInFlightCount ? (
                      <span className="is-uploading">
                        {uploadInFlightCount} uploading
                      </span>
                    ) : null}
                    {uploadFailedCount ? (
                      <span className="is-failed">
                        {uploadFailedCount} failed
                      </span>
                    ) : null}
                  </p>
                  <ul
                    className="upload-queue"
                    aria-label="Selected photo uploads"
                  >
                    {uploads.map((item) => (
                      <li key={item.id} data-status={item.status}>
                        <span
                          className="upload-queue__state"
                          aria-hidden="true"
                        >
                          {item.status === "ready" ? (
                            <Icon name="check" size={15} />
                          ) : item.status === "failed" ? (
                            <Icon name="warning" size={15} />
                          ) : (
                            <span />
                          )}
                        </span>
                        <UploadPreview item={item} />
                        <div className="upload-queue-details">
                          <strong>{item.fileName}</strong>
                          <small>{formatFileSize(item.fileSize)}</small>
                        </div>
                        <div className="upload-queue-progress">
                          <span>
                            <strong>{UPLOAD_STATUS_LABELS[item.status]}</strong>
                            <small>{item.progress}%</small>
                          </span>
                          <progress
                            aria-label={`Upload progress for ${item.fileName}`}
                            max={100}
                            value={item.progress}
                          >
                            {item.progress}%
                          </progress>
                          {item.error ? <small>{item.error}</small> : null}
                        </div>
                        <div className="button-row upload-queue-actions">
                          {uploadCanRetry(item) ? (
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={Boolean(pending) || uploadActive}
                              onClick={() => void uploadSelected([item])}
                            >
                              Retry
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className={
                              uploadDismissesLocally(item)
                                ? "secondary-button"
                                : "danger-button"
                            }
                            aria-busy={pending === `remove-upload:${item.id}`}
                            disabled={Boolean(pending) || uploadActive}
                            onClick={() => void removeUpload(item)}
                          >
                            {pending === `remove-upload:${item.id}`
                              ? "Removing…"
                              : uploadDismissesLocally(item)
                                ? "Dismiss"
                                : "Remove"}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {uploadActive ? (
                <p role="status">Uploading and processing selected photos…</p>
              ) : null}
              {draft.photos.length ? (
                <div className="photo-library" hidden>
                  <div
                    className="photo-library-heading"
                    role="status"
                    aria-live="polite"
                  >
                    <span>
                      <Icon name="photo" size={19} />
                      <strong>Photos uploaded</strong>
                      <span className="photo-library-count">
                        {readyPhotoCount} of {MAX_EVENT_PHOTOS}
                      </span>
                    </span>
                    <small>
                      {hasReadyCover
                        ? `1 cover · ${String(Math.max(0, readyPhotoCount - 1))} additional`
                        : `${String(readyPhotoCount)} ready · choose a cover`}
                    </small>
                  </div>

                  {coverPhoto ? (
                    <section
                      className="photo-cover-card"
                      aria-label="Selected cover photo"
                    >
                      <div className="photo-cover-card__heading">
                        <span>Cover photo</span>
                        <span className="status-badge status-badge--success">
                          Ready
                        </span>
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={coverPhoto.urls.thumbnail}
                        alt={`Event photo ${coverPhotoIndex + 1}`}
                      />
                      <div>
                        <strong>Photo {coverPhotoIndex + 1} - Cover</strong>
                        <p>Status: {coverPhoto.status}</p>
                      </div>
                    </section>
                  ) : null}

                  {additionalPhotos.length ? (
                    <ol
                      className="photo-list photo-list--compact"
                      aria-label="Event photo order"
                      style={
                        {
                          "--visible-photo-rows": Math.min(
                            additionalPhotos.length,
                            10,
                          ),
                        } as CSSProperties
                      }
                    >
                      {additionalPhotos.map((photo) => {
                        const index = draft.photos.findIndex(
                          (candidate) => candidate.id === photo.id,
                        );
                        return (
                          <li key={photo.id}>
                            {photo.status === "READY" ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={photo.urls.thumbnail}
                                alt={`Event photo ${index + 1}`}
                              />
                            ) : (
                              <div className="photo-placeholder">
                                {photo.status}
                              </div>
                            )}
                            <div className="photo-list__details">
                              <strong>Photo {index + 1}</strong>
                              <p>Status: {photo.status}</p>
                              {photo.errorCode ? (
                                <p>Safe error: {photo.errorCode}</p>
                              ) : null}
                            </div>
                            <PhotoActionDropdown
                              photoId={photo.id}
                              label={`photo ${index + 1}`}
                              canMoveEarlier={index > 0}
                              canMoveLater={index < draft.photos.length - 1}
                              canMakeCover={
                                photo.status === "READY" && !photo.isCover
                              }
                              disabled={Boolean(pending) || uploadActive}
                              onMoveEarlier={() => movePhoto(photo.id, -1)}
                              onMoveLater={() => movePhoto(photo.id, 1)}
                              onMakeCover={() => selectCover(photo.id)}
                              onDelete={() => removePhoto(photo.id)}
                            />
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <p className="photo-library-empty">
                      Your cover is the only uploaded photo. Add more photos to
                      build the gallery.
                    </p>
                  )}
                </div>
              ) : (
                <p hidden>No server-stored photos yet.</p>
              )}
              <div className="photo-manager">
                <div
                  className="photo-manager__heading"
                  role="status"
                  aria-live="polite"
                >
                  <span>
                    <Icon name="photo" size={19} />
                    <strong>Photos uploaded</strong>
                    <span className="photo-manager__count">
                      {readyPhotoCount} of {MAX_EVENT_PHOTOS}
                    </span>
                  </span>
                  <small>
                    {uploadInFlightCount
                      ? `${String(uploadInFlightCount)} uploading`
                      : uploadFailedCount
                        ? `${String(uploadFailedCount)} failed`
                        : hasReadyCover
                          ? "Cover selected"
                          : readyPhotoCount
                            ? "Choose a cover"
                            : "No photos uploaded yet"}
                  </small>
                </div>

                {photoManagerRows.length ? (
                  <ol
                    className="photo-manager__list"
                    aria-label="Photo uploads and event photo order"
                    style={
                      {
                        "--visible-photo-rows": Math.min(
                          photoManagerRows.length,
                          10,
                        ),
                      } as CSSProperties
                    }
                  >
                    {photoManagerRows.map((row) => {
                      const { upload, photo, photoIndex } = row;
                      const isReady = photo?.status === "READY";
                      const status = upload
                        ? UPLOAD_STATUS_LABELS[upload.status]
                        : (photo?.status ?? "Queued");
                      const displayName =
                        upload?.fileName ?? `Photo ${String(photoIndex + 1)}`;
                      const dataStatus =
                        upload?.status ??
                        photo?.status.toLowerCase() ??
                        "selected";

                      return (
                        <li key={row.key} data-status={dataStatus}>
                          <span
                            className="photo-manager__state"
                            aria-hidden="true"
                          >
                            {isReady || upload?.status === "ready" ? (
                              <Icon name="check" size={15} />
                            ) : upload?.status === "failed" ||
                              photo?.status === "FAILED" ? (
                              <Icon name="warning" size={15} />
                            ) : (
                              <span />
                            )}
                          </span>

                          {upload ? (
                            <UploadPreview item={upload} />
                          ) : photo?.status === "READY" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              className="upload-preview"
                              src={photo.urls.thumbnail}
                              alt={`Event photo ${photoIndex + 1}`}
                            />
                          ) : (
                            <div className="upload-preview-fallback">
                              {photo?.status ?? "Queued"}
                            </div>
                          )}

                          <div className="photo-manager__details">
                            <span>
                              <strong>{displayName}</strong>
                              {photo?.isCover ? (
                                <span className="photo-cover-pill">Cover</span>
                              ) : null}
                            </span>
                            <small>
                              {upload
                                ? formatFileSize(upload.fileSize)
                                : `Status: ${status}`}
                            </small>
                          </div>

                          <div className="photo-manager__progress">
                            <span>
                              <strong>{status}</strong>
                              {upload && upload.status !== "ready" ? (
                                <small>{upload.progress}%</small>
                              ) : null}
                            </span>
                            {upload && upload.status !== "ready" ? (
                              <progress
                                aria-label={`Upload progress for ${upload.fileName}`}
                                max={100}
                                value={upload.progress}
                              >
                                {upload.progress}%
                              </progress>
                            ) : null}
                            {upload?.error ? (
                              <small>{upload.error}</small>
                            ) : null}
                            {!upload && photo?.errorCode ? (
                              <small>Safe error: {photo.errorCode}</small>
                            ) : null}
                          </div>

                          {isReady && photo ? (
                            <PhotoActionDropdown
                              photoId={photo.id}
                              label={displayName}
                              canMoveEarlier={photoIndex > 0}
                              canMoveLater={
                                photoIndex < draft.photos.length - 1
                              }
                              canMakeCover={!photo.isCover}
                              disabled={Boolean(pending) || uploadActive}
                              onMoveEarlier={() => movePhoto(photo.id, -1)}
                              onMoveLater={() => movePhoto(photo.id, 1)}
                              onMakeCover={() => selectCover(photo.id)}
                              onDelete={() => removePhoto(photo.id)}
                            />
                          ) : upload ? (
                            <div className="button-row photo-manager__actions">
                              {uploadCanRetry(upload) ? (
                                <button
                                  type="button"
                                  className="secondary-button"
                                  disabled={Boolean(pending) || uploadActive}
                                  onClick={() => void uploadSelected([upload])}
                                >
                                  Retry
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="danger-button"
                                aria-busy={
                                  pending === `remove-upload:${upload.id}`
                                }
                                disabled={Boolean(pending) || uploadActive}
                                onClick={() => void removeUpload(upload)}
                              >
                                {pending === `remove-upload:${upload.id}`
                                  ? "Removing…"
                                  : "Remove"}
                              </button>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="photo-manager__empty">
                    No server-stored photos yet.
                  </p>
                )}
              </div>
              <p className="photo-readiness" role="status">
                <Icon name="shield" size={20} />
                <span>
                  {readyPhotoCount === 0
                    ? "Add at least one photo to continue."
                    : !hasReadyCover
                      ? `${String(readyPhotoCount)} ${readyPhotoCount === 1 ? "photo has" : "photos have"} finished processing. Choose a cover to continue.`
                      : `${String(readyPhotoCount)} ${readyPhotoCount === 1 ? "photo is" : "photos are"} uploaded and the cover is selected.`}
                </span>
              </p>
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
                  aria-busy={pending === "photos-continue"}
                  disabled={
                    Boolean(pending) ||
                    uploadActive ||
                    !draft.steps.photosComplete
                  }
                  onClick={() => void continueFromPhotos()}
                >
                  {pending === "photos-continue"
                    ? "Checking…"
                    : readyPhotoCount === 0
                      ? "Add a photo to continue"
                      : !hasReadyCover
                        ? "Choose a cover to continue"
                        : "Save and continue"}
                </button>
              </div>
            </section>
          ) : null}

          {step === "review" ? (
            <section className="builder-card" aria-labelledby="review-title">
              <p className="eyebrow">Step 5 of 5</p>
              <h2 id="review-title" ref={stepHeadingRef} tabIndex={-1}>
                Review, approval and payment
              </h2>
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
                  Exact preview is unavailable until the incomplete steps above
                  are saved.
                </p>
              )}
              {draft.publication ? (
                <div className="success-box" role="status">
                  <strong>This listing is published.</strong>
                  <p>
                    Payment was confirmed and the approved revision is live. The
                    published listing is no longer awaiting payment.
                  </p>
                  <Link
                    className="button-link"
                    href={draft.publication.canonicalPath}
                  >
                    View live listing
                  </Link>
                </div>
              ) : approvalIsCurrent ? (
                <div>
                  <div className="success-box" role="status">
                    <strong>
                      Revision {draft.approvedRevision} is approved.
                    </strong>
                    <p>
                      Approval is saved, and this listing remains a private
                      draft until payment is confirmed. You can leave and come
                      back to make the payment later.
                    </p>
                    <p>
                      Editing saved listing content creates a new revision that
                      must be reviewed and approved again.
                    </p>
                  </div>
                  <div className="wizard-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={Boolean(pending)}
                      onClick={() => setStep("photos")}
                    >
                      Back
                    </button>
                    <Link
                      className="button-link"
                      href={`/dashboard/events/${draft.id}/payment`}
                    >
                      Make payment
                    </Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={approve}>
                  {emailVerified ? (
                    <p className="warning-box">
                      Your verified email address, {accountEmail}, will be
                      visible on the live listing.
                    </p>
                  ) : (
                    <section
                      className="review-verification"
                      aria-labelledby="review-verification-title"
                    >
                      <div>
                        <h3 id="review-verification-title">
                          Verify your email to continue
                        </h3>
                        <p>
                          Verify your email to approve this event. We&apos;ll
                          send the link to {accountEmail}. Your draft and photos
                          are already saved.
                        </p>
                      </div>
                      <div className="review-verification__actions">
                        <button
                          type="button"
                          onClick={() => void sendVerificationEmail()}
                          disabled={Boolean(verificationPending)}
                        >
                          {verificationPending === "send"
                            ? "Sending..."
                            : "Send verification email"}
                        </button>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => void checkVerificationStatus()}
                          disabled={Boolean(verificationPending)}
                        >
                          {verificationPending === "check"
                            ? "Checking..."
                            : "Check verification status"}
                        </button>
                      </div>
                      {verificationMessage ? (
                        <p
                          className="review-verification__message"
                          role="status"
                        >
                          {verificationMessage}
                        </p>
                      ) : null}
                    </section>
                  )}
                  <label className="checkbox-label">
                    <input type="checkbox" name="acceptedTerms" value="yes" />I
                    accept publishing terms version {termsVersion} and approve
                    this exact event revision for payment.
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
                      disabled={
                        !draft.steps.reviewReady ||
                        !emailVerified ||
                        Boolean(pending)
                      }
                      type="submit"
                    >
                      {pending === "approval"
                        ? "Approving…"
                        : "Approve exact revision"}
                    </button>
                  </div>
                </form>
              )}
            </section>
          ) : null}
        </div>
        <aside
          className="builder-rail"
          aria-label="Listing progress and preview"
        >
          <section
            className="builder-preview-card"
            aria-labelledby="builder-preview-title"
          >
            <div className="builder-rail-heading">
              <p className="eyebrow">Listing preview</p>
              <Icon name="photo" />
            </div>
            {coverPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverPhoto.urls.card} alt="Selected listing cover" />
            ) : (
              <div className="builder-preview-placeholder">
                <Icon name="photo" />
                <span>Your cover photo will appear here</span>
              </div>
            )}
            <span className="status-badge status-badge--neutral">
              {draft.eventType === "ESTATE_SALE" ? "Estate sale" : "Yard sale"}
            </span>
            <h2 id="builder-preview-title">{draft.title ?? "Untitled sale"}</h2>
            <dl>
              <div>
                <dt>
                  <Icon name="calendar" size={17} /> Schedule
                </dt>
                <dd>
                  {formatListingDate(
                    draft.startsAt,
                    draft.localStartsAt,
                    draft.timezone,
                  )}
                </dd>
              </div>
              <div>
                <dt>
                  <Icon name="shield" size={17} /> Privacy
                </dt>
                <dd>
                  {draft.privacyMode
                    ? draft.privacyMode.replaceAll("_", " ").toLowerCase()
                    : "Not set"}
                </dd>
              </div>
            </dl>
          </section>
          <section
            className="builder-checklist"
            aria-labelledby="builder-checklist-title"
          >
            <div className="builder-rail-heading">
              <h2 id="builder-checklist-title">What’s left</h2>
              <span>
                {completionItems.filter((item) => item.complete).length}/5
              </span>
            </div>
            <ul>
              {completionItems.map((item) => (
                <li
                  className={item.complete ? "is-complete" : ""}
                  key={item.label}
                >
                  <span aria-hidden="true">
                    {item.complete ? <Icon name="check" size={14} /> : null}
                  </span>
                  {item.label}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
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
      <button aria-busy={pending} disabled={pending} type="submit">
        {pending ? loadingLabel : "Save and continue"}
      </button>
    </div>
  );
}
