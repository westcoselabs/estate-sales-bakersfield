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
import { preparePhotoForUpload } from "@/modules/media/client/prepare-photo";

import {
  completedWizardSteps,
  EVENT_WIZARD_STEPS,
  resumeEventWizardStep,
  wizardStepAvailable,
  type EventWizardStep,
} from "./event-wizard-state";
import { photoBatchSummary, photoUploadTimeoutMs } from "./photo-upload-state";
import {
  createPhotoMutationQueue,
  runPhotoUploadPipeline,
} from "./photo-upload-pipeline";
import uploadStyles from "./photo-upload-progress.module.css";
import { EventScheduleEditor } from "./event-schedule-editor";
import { EventReadinessNotice } from "./event-readiness-notice";
import scheduleStyles from "./event-schedule-editor.module.css";
import {
  editorAddressRevealAt,
  editorScheduleDays,
  formatSaleDay,
  formatSaleTime,
  SALE_TIMEZONE,
  scheduleValidationMessage,
} from "./event-schedule-state";

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
  readonly orderAndDeleteDisabled?: boolean;
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
  orderAndDeleteDisabled = false,
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
                disabled={!canMoveEarlier || disabled || orderAndDeleteDisabled}
                onClick={() => runAction(onMoveEarlier)}
              >
                Move earlier
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!canMoveLater || disabled || orderAndDeleteDisabled}
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
                disabled={disabled || orderAndDeleteDisabled}
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
  selected: "Waiting",
  reserving: "Preparing",
  uploading: "Uploading",
  processing: "Finishing",
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
      loading="lazy"
      decoding="async"
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
    readonly retryAfterSeconds?: number,
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
  if (!response.ok) {
    const error = requestError(result, "The event could not be updated.");
    const retryAfter = Number(response.headers.get("Retry-After"));
    if (
      error instanceof ApiRequestError &&
      Number.isFinite(retryAfter) &&
      retryAfter > 0
    ) {
      throw new ApiRequestError(error.message, error.code, retryAfter);
    }
    throw error;
  }
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
  const [scheduleDays, setScheduleDays] = useState(() =>
    editorScheduleDays(initialEvent),
  );
  const timezone = SALE_TIMEZONE;
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
    initialEvent.privacyMode === "EXACT_ADDRESS"
      ? "EXACT_ADDRESS"
      : "HIDDEN_UNTIL_START",
  );
  const [localAddressRevealAt, setLocalAddressRevealAt] = useState(() =>
    editorAddressRevealAt(initialEvent),
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
  const photoMutationQueue = useRef(createPhotoMutationQueue());
  const disposed = useRef(false);
  const operationActiveRef = useRef(false);
  const photoDragDepth = useRef(0);
  const previewUrls = useRef(new Set<string>());
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousStepRef = useRef(step);

  useEffect(() => {
    if (!draft.publication || !draft.endsAt) return;
    const end = new Date(draft.endsAt).getTime();
    let timer: ReturnType<typeof setTimeout>;
    function checkEnd() {
      const remaining = end - Date.now();
      if (remaining <= 0) {
        router.replace(`/dashboard/events/${draft.id}/payment`);
        return;
      }
      timer = setTimeout(checkEnd, Math.min(remaining + 100, 2_147_483_647));
    }
    checkEnd();
    return () => clearTimeout(timer);
  }, [draft.publication, draft.endsAt, draft.id, router]);

  useEffect(() => {
    disposed.current = false;
    const activeControllers = controllers.current;
    const activePreviews = previewUrls.current;
    return () => {
      disposed.current = true;
      for (const controller of activeControllers) controller.abort();
      activeControllers.clear();
      for (const url of activePreviews) URL.revokeObjectURL(url);
      activePreviews.clear();
    };
  }, []);

  useEffect(() => {
    if (!uploadActive) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const beforeNavigation = (event: MouseEvent) => {
      const link =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.target === "_blank" ||
        link.download ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        link.href.startsWith(`${window.location.href}#`)
      )
        return;
      if (
        !window.confirm(
          "Photos are still uploading. Leave this page and stop the remaining uploads?",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", beforeNavigation, true);
    };
  }, [uploadActive]);

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

  function syncForms(
    event: EventEditorDto,
    previous: EventEditorDto,
    savedStep?: EventWizardStep,
  ) {
    setTitle((current) =>
      savedStep === "details" || current === (previous.title ?? "")
        ? (event.title ?? "")
        : current,
    );
    setDescription((current) =>
      savedStep === "details" || current === (previous.description ?? "")
        ? (event.description ?? "")
        : current,
    );
    setScheduleDays((current) =>
      savedStep === "schedule" ||
      JSON.stringify(current) === JSON.stringify(editorScheduleDays(previous))
        ? editorScheduleDays(event)
        : current,
    );
    if (
      savedStep === "location" ||
      JSON.stringify(event.location) !== JSON.stringify(previous.location)
    ) {
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
    }
    const previousPrivacyMode =
      previous.privacyMode === "EXACT_ADDRESS"
        ? "EXACT_ADDRESS"
        : "HIDDEN_UNTIL_START";
    setPrivacyMode((current) =>
      savedStep === "location" || current === previousPrivacyMode
        ? event.privacyMode === "EXACT_ADDRESS"
          ? "EXACT_ADDRESS"
          : "HIDDEN_UNTIL_START"
        : current,
    );
    setLocalAddressRevealAt((current) =>
      savedStep === "location" || current === editorAddressRevealAt(previous)
        ? editorAddressRevealAt(event)
        : current,
    );
  }

  function acceptEvent(event: EventEditorDto, savedStep?: EventWizardStep) {
    if (disposed.current || event.version < draftRef.current.version) return;
    const previous = draftRef.current;
    draftRef.current = event;
    setDraft(event);
    syncForms(event, previous, savedStep);
  }

  async function request<T>(
    url: string,
    method = "GET",
    body?: unknown,
    timeoutMs = 25_000,
  ): Promise<T> {
    if (disposed.current)
      throw new DOMException("Upload stopped", "AbortError");
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
      await photoMutationQueue.current(async () => {
        let response: EventResponse;
        try {
          response = await request<EventResponse>(endpoint, method, {
            ...body,
            expectedVersion: draftRef.current.version,
          });
        } catch (error) {
          if (!(error instanceof StaleVersionError)) throw error;
          await refreshEvent();
          throw new Error(
            "This listing changed in another tab. The latest version is now loaded; review it and save your changes again.",
          );
        }
        acceptEvent(response.event, target);
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
      });
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
    const message = scheduleValidationMessage(scheduleDays);
    if (message) {
      setStepFeedback("schedule", {
        kind: "error",
        text: message,
      });
      return;
    }
    void saveStep(
      "schedule",
      `/api/events/${draftRef.current.id}/schedule`,
      "PUT",
      {
        expectedVersion: draftRef.current.version,
        scheduleDays,
        timezone,
      },
      (saved) => saved.steps.scheduleComplete,
      "location",
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
    saveLocationValues();
  }

  function saveLocationValues(asUnconfirmedDraft = false) {
    if (
      asUnconfirmedDraft &&
      (addressLine1.trim().length < 3 ||
        city.trim().length < 2 ||
        region.trim().length < 2)
    ) {
      const text =
        "Enter the street address, city, and state to save your draft.";
      setLocationAddressError(text);
      setStepFeedback("location", { kind: "error", text });
      return;
    }
    if (
      privacyMode === "HIDDEN_UNTIL_START" &&
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localAddressRevealAt)
    ) {
      setStepFeedback("location", {
        kind: "error",
        text: "Choose the date and time when the full address should be shown.",
      });
      return;
    }
    const currentLocation = draftRef.current.location;
    const hasSavedConfirmedAddress =
      currentLocation?.confirmationStatus === "CONFIRMED" &&
      currentLocation.latitude !== null &&
      currentLocation.longitude !== null;

    if (!asUnconfirmedDraft && !selectedAddress && !hasSavedConfirmedAddress) {
      const text = "Select an address from the results to continue.";
      setLocationAddressError(text);
      setStepFeedback("location", { kind: "error", text });
      return;
    }

    if (!asUnconfirmedDraft && !locationConfirmed) {
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
        localAddressRevealAt:
          privacyMode === "HIDDEN_UNTIL_START" ? localAddressRevealAt : null,
        selectionToken: asUnconfirmedDraft ? null : selectionToken,
        confirmed: !asUnconfirmedDraft && locationConfirmed,
      },
      (saved) => saved.steps.locationComplete,
      "photos",
      asUnconfirmedDraft,
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
          (photo) =>
            photo.id === item.photoId &&
            photo.status !== "READY" &&
            photo.errorCode !== "MEDIA_DELETION_PENDING",
        )
      ) {
        await cleanupReservation(item.photoId);
        updateUpload(item.id, { photoId: undefined });
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
      updateUpload(item.id, { photoId: reserved.reservation.photoId });
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
            `The photo upload failed (${String(upload.status)}). Please retry.`,
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
    signal: AbortSignal,
  ): Promise<UploadAttemptResult> {
    const { item, reservation } = transfer.reserved;
    const photoId = reservation.photoId;
    let finalizeAttempted = false;
    try {
      let completed: EventResponse | undefined;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        signal.throwIfAborted();
        finalizeAttempted = true;
        try {
          completed = await request<EventResponse>(
            `/api/events/${draftRef.current.id}/photos/${photoId}/finalize`,
            "POST",
            {
              expectedVersion: draftRef.current.version,
              reservationId: reservation.reservationId,
              pathname: transfer.pathname,
            },
            90_000,
          );
          break;
        } catch (error) {
          if (error instanceof StaleVersionError && attempt < 3) {
            // Version conflicts happen before reservation consumption. Another
            // tab may have saved; retain the upload and use the latest version.
            finalizeAttempted = false;
            await refreshEvent();
            continue;
          }
          if (
            !(error instanceof ApiRequestError) ||
            ![
              "PROCESSING_BUSY",
              "RATE_LIMITED",
              "LIMITER_UNAVAILABLE",
            ].includes(error.code ?? "") ||
            attempt === 3
          )
            throw error;
          // The server has not consumed this upload. Reuse its bytes after the
          // requested pause instead of deleting it and uploading the file again.
          finalizeAttempted = false;
          updateUpload(item.id, {
            error: "Waiting for a free spot. Your photo is already uploaded.",
          });
          await new Promise<void>((resolve, reject) => {
            const abort = () => {
              window.clearTimeout(timer);
              reject(new DOMException("Upload stopped", "AbortError"));
            };
            const timer = window.setTimeout(
              () => {
                signal.removeEventListener("abort", abort);
                resolve();
              },
              Math.max(1, error.retryAfterSeconds ?? 2 * (attempt + 1)) * 1000,
            );
            signal.addEventListener("abort", abort, { once: true });
          });
        }
      }
      if (!completed)
        throw new Error("This photo could not be finished. Please try again.");
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
      if (signal.aborted) return "pending";
      // These responses are issued before the reservation is consumed. Read
      // back its state, then safely clean it up so the user can retry. A lost
      // response or a processing failure remains ambiguous and is not retried.
      if (
        error instanceof StaleVersionError ||
        (error instanceof ApiRequestError &&
          ["PROCESSING_BUSY", "RATE_LIMITED", "LIMITER_UNAVAILABLE"].includes(
            error.code ?? "",
          ))
      ) {
        finalizeAttempted = false;
      }
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
            "This photo is still being checked. Refresh the page to check its progress.",
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
      operationActiveRef.current
    ) {
      return;
    }
    uploadActiveRef.current = true;
    setUploadActive(true);
    const controller = new AbortController();
    controllers.current.add(controller);
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
      let succeeded = 0;
      let failed = batch.length - candidates.length;
      let awaitingConfirmation = 0;
      await runPhotoUploadPipeline(candidates, {
        concurrency: MAX_PARALLEL_PHOTO_TRANSFERS,
        signal: controller.signal,
        process: async (item) => {
          try {
            if (!item.file) return;
            updateUpload(item.id, {
              status: "reserving",
              progress: 0,
              error: undefined,
            });
            const prepared = await preparePhotoForUpload(item.file, {
              signal: controller.signal,
            });
            controller.signal.throwIfAborted();
            const preparedItem = {
              ...item,
              file: prepared.file,
              fileSize: prepared.file.size,
            };
            updateUpload(item.id, {
              file: prepared.file,
              fileSize: prepared.file.size,
            });
            const reservation = await photoMutationQueue.current(() =>
              reserveUpload(preparedItem),
            );
            if (!reservation) {
              failed += 1;
              return;
            }
            controller.signal.throwIfAborted();
            const transfer = await transferReservedUpload(
              reservation,
              reservation.reservation.event.version,
            );
            if (!transfer) {
              failed += 1;
              return;
            }
            const result = await photoMutationQueue.current(() =>
              finalizeTransferredUpload(transfer, controller.signal),
            );
            if (result === "ready") succeeded += 1;
            else if (result === "pending") awaitingConfirmation += 1;
            else failed += 1;
          } catch (error) {
            if (controller.signal.aborted) return;
            failed += 1;
            updateUpload(item.id, {
              status: "failed",
              progress: 0,
              retryable: true,
              error:
                error instanceof Error
                  ? error.message
                  : "This photo could not be uploaded. Please try again.",
            });
          }
        },
      });
      if (controller.signal.aborted) return;
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
      controllers.current.delete(controller);
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
    if (!beginOperation(name)) return;
    try {
      await photoMutationQueue.current(async () => {
        const response = await request<EventResponse>(endpoint, method, {
          ...body,
          expectedVersion: draftRef.current.version,
        });
        acceptEvent(response.event);
      });
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
      item.status === "ready" || persistedPhoto?.status === "READY";
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
    if (uploadActiveRef.current) {
      setStep("review");
      return;
    }
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
    if (
      uploadActiveRef.current ||
      draftRef.current.photos.some((photo) =>
        ["RESERVED", "UPLOADED", "PROCESSING"].includes(photo.status),
      )
    ) {
      setStepFeedback("review", {
        kind: "error",
        text: "Wait for your photos to finish uploading before approving the sale.",
      });
      return;
    }
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
    return item.status === "ready" || photo?.status === "READY";
  }

  function uploadCanRetry(item: UploadItem): boolean {
    const photo = persistedUploadPhoto(item);
    return Boolean(
      item.status === "failed" &&
      item.retryable &&
      item.file &&
      (!photo || photo.status === "FAILED" || photo.status === "RESERVED"),
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
      .filter(
        (upload) =>
          !upload.photoId ||
          !draft.photos.some((photo) => photo.id === upload.photoId),
      )
      .map((upload) => ({
        key: upload.id,
        upload,
        photo: undefined,
        photoIndex: -1,
      })),
  ]
    .filter((row) => row.photo?.errorCode !== "MEDIA_DELETION_PENDING")
    .sort(
      (left, right) =>
        Number(Boolean(right.photo?.isCover)) -
        Number(Boolean(left.photo?.isCover)),
    );
  const currentStepIndex = EVENT_WIZARD_STEPS.indexOf(step);
  const hasPendingPhotos =
    uploadActive ||
    draft.photos.some((photo) =>
      ["RESERVED", "UPLOADED", "PROCESSING"].includes(photo.status),
    );
  const stepAvailable = (target: EventWizardStep) =>
    wizardStepAvailable(target, draft.steps) ||
    (target === "review" &&
      uploadActive &&
      draft.steps.detailsComplete &&
      draft.steps.scheduleComplete);
  const previousStep =
    currentStepIndex > 0 ? EVENT_WIZARD_STEPS[currentStepIndex - 1] : undefined;
  const nextStep = EVENT_WIZARD_STEPS[currentStepIndex + 1];
  const canAdvanceToNextStep = Boolean(nextStep && stepAvailable(nextStep));

  return (
    <div className="builder-layout">
      <div
        className="wizard-mobile-navigation"
        aria-label="Event builder navigation"
      >
        <button
          type="button"
          className="secondary-button"
          disabled={!previousStep || Boolean(pending)}
          onClick={() => previousStep && setStep(previousStep)}
        >
          Back
        </button>
        <button
          type="button"
          disabled={!canAdvanceToNextStep || Boolean(pending)}
          onClick={() => nextStep && setStep(nextStep)}
        >
          Next
        </button>
      </div>
      <nav aria-label="Event builder progress" className="wizard-timeline">
        {EVENT_WIZARD_STEPS.map((item, index) => {
          const available = stepAvailable(item);
          const current = item === step;
          return (
            <button
              key={item}
              type="button"
              className={
                current ? "is-current" : completed[item] ? "is-complete" : ""
              }
              disabled={!available || Boolean(pending)}
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

      {draft.publication ? (
        <div className="success-box" role="status">
          <strong>This listing is published.</strong> Save changes to update the
          live listing. You can edit the about section, dates, times, and photos
          without another payment.
        </div>
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
          {uploadActive ? (
            <section
              className={uploadStyles.summary}
              aria-label="Photo upload progress"
            >
              <strong role="status">
                {uploadReadyCount} of {uploads.length} photos ready
              </strong>
              <progress
                aria-label="Overall photo upload progress"
                max={Math.max(1, uploads.length)}
                value={uploadReadyCount}
              />
              <p>
                You can review your sale while photos upload. Keep this tab
                open.
              </p>
              {uploadFailedCount > 0 ? (
                <small>
                  {uploadFailedCount}{" "}
                  {uploadFailedCount === 1 ? "photo needs" : "photos need"}{" "}
                  attention. You can retry after the remaining photos finish.
                </small>
              ) : null}
              {step === "photos" ? (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={Boolean(pending)}
                  onClick={() => setStep("review")}
                >
                  Continue to review
                </button>
              ) : (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={Boolean(pending)}
                  onClick={() => setStep("photos")}
                >
                  View photos
                </button>
              )}
            </section>
          ) : null}
          {step === "review" &&
          !uploadActive &&
          (uploadFailedCount > 0 || !hasReadyCover || hasPendingPhotos) ? (
            <p className="warning-box">
              {hasPendingPhotos
                ? "Some photos are still being checked. Refresh to check their progress."
                : !hasReadyCover
                  ? "Choose a cover photo before approving your sale."
                  : "Some photos did not upload. Return to Photos to retry them or remove them."}{" "}
              <button
                type="button"
                className="secondary-button"
                onClick={() => setStep("photos")}
              >
                View photos
              </button>
            </p>
          ) : null}
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
                    Select every date your sale is open, then enter a start and
                    end time for each day.
                  </p>
                </div>
              </div>
              <form onSubmit={saveSchedule}>
                {!draft.scheduleDays?.length &&
                draft.localStartsAt &&
                draft.localEndsAt &&
                draft.localStartsAt.slice(0, 10) !==
                  draft.localEndsAt.slice(0, 10) ? (
                  <p className="warning-box">
                    Daily hours were not previously saved. Review the suggested
                    opening and closing times for each day before saving.
                  </p>
                ) : null}
                <EventScheduleEditor
                  days={scheduleDays}
                  onChange={setScheduleDays}
                  disabled={Boolean(pending)}
                />
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
              {draft.publication ? (
                <div>
                  <p>{draft.location?.normalizedAddress}</p>
                  <p>The published address and privacy settings are fixed.</p>
                  <div className="button-row">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setStep("schedule")}
                    >
                      Back
                    </button>
                    <button type="button" onClick={() => setStep("photos")}>
                      Continue to Photos
                    </button>
                  </div>
                </div>
              ) : (
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
                      <p>
                        If you can’t find the address, save it as a draft and
                        continue. Confirm the property before approving your
                        sale.
                      </p>
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
                  <fieldset disabled={Boolean(pending)}>
                    <legend>Privacy for this address</legend>
                    {(
                      [
                        ["EXACT_ADDRESS", "Show exact address"],
                        ["HIDDEN_UNTIL_START", "Hide address until"],
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
                    {privacyMode === "HIDDEN_UNTIL_START" ? (
                      <div className={scheduleStyles.reveal}>
                        <label>
                          Address reveal date
                          <input
                            type="date"
                            value={localAddressRevealAt.split("T")[0] ?? ""}
                            onChange={(event) =>
                              setLocalAddressRevealAt(
                                `${event.target.value}T${localAddressRevealAt.split("T")[1] ?? "08:00"}`,
                              )
                            }
                            required
                            aria-describedby="address-reveal-note"
                          />
                        </label>
                        <label>
                          Address reveal time
                          <input
                            type="time"
                            value={localAddressRevealAt.split("T")[1] ?? ""}
                            onChange={(event) =>
                              setLocalAddressRevealAt(
                                `${localAddressRevealAt.split("T")[0] ?? ""}T${event.target.value}`,
                              )
                            }
                            required
                            aria-describedby="address-reveal-note"
                          />
                        </label>
                        <p id="address-reveal-note">
                          Pacific Time (US/Pacific). Until then, shoppers will
                          see the general area on the map. The full address will
                          appear automatically at your selected date and time.
                        </p>
                      </div>
                    ) : null}
                  </fieldset>
                  <StepFeedback feedback={currentFeedback} />
                  {!locationConfirmed ? (
                    <div className="button-row">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={Boolean(pending)}
                        onClick={() => saveLocationValues(true)}
                      >
                        Save draft and continue to Photos
                      </button>
                    </div>
                  ) : null}
                  <WizardActions
                    back={() => setStep("schedule")}
                    pending={pending === "location"}
                    loadingLabel="Validating…"
                  />
                </form>
              )}
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
                Add photos of the items for sale, then choose a cover photo.
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
                        src={coverPhoto.urls.gallery}
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
                {uploads.filter(uploadCanRetry).length > 1 ? (
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={Boolean(pending) || uploadActive}
                    onClick={() =>
                      void uploadSelected(uploads.filter(uploadCanRetry))
                    }
                  >
                    Retry failed photos
                  </button>
                ) : null}
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
                              disabled={Boolean(pending)}
                              orderAndDeleteDisabled={uploadActive}
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
                          ) : photo ? (
                            <button
                              type="button"
                              className="danger-button"
                              disabled={Boolean(pending) || uploadActive}
                              onClick={() => removePhoto(photo.id)}
                            >
                              Remove
                            </button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="photo-manager__empty">No photos added yet.</p>
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
                  disabled={Boolean(pending)}
                  onClick={() => setStep("location")}
                >
                  Back
                </button>
                <button
                  type="button"
                  aria-busy={pending === "photos-continue"}
                  disabled={
                    Boolean(pending) ||
                    (!uploadActive && !draft.steps.photosComplete)
                  }
                  onClick={() => void continueFromPhotos()}
                >
                  {pending === "photos-continue"
                    ? "Checking…"
                    : uploadActive
                      ? "Continue to review"
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
                  <dt>Approval</dt>
                  <dd>{draft.approvalStatus.replaceAll("_", " ")}</dd>
                </div>
              </dl>
              <section
                className={scheduleStyles.review}
                aria-label="Review sale dates and address privacy"
              >
                <h3>Dates &amp; times · Pacific Time</h3>
                {editorScheduleDays(draft).length ? (
                  <ul>
                    {editorScheduleDays(draft).map((day) => (
                      <li key={day.date}>
                        {formatSaleDay(day.date)} ·{" "}
                        {formatSaleTime(day.startTime)} –{" "}
                        {formatSaleTime(day.endTime)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No sale dates saved.</p>
                )}
                <p>
                  {draft.privacyMode === "EXACT_ADDRESS"
                    ? "The full address is shown when the listing is published."
                    : draft.privacyMode === "HIDDEN_UNTIL_START" &&
                        editorAddressRevealAt(draft)
                      ? `Full address will be shown on ${formatSaleDay(editorAddressRevealAt(draft).slice(0, 10))} at ${formatSaleTime(editorAddressRevealAt(draft).slice(11, 16))}, Pacific Time. Shoppers see the general area until then.`
                      : "The full address is hidden. Choose a reveal date and time in Privacy."}
                </p>
              </section>
              {!draft.readiness.ready ? (
                <EventReadinessNotice
                  eventId={draft.id}
                  missing={draft.readiness.missing}
                  uploading={uploadActive}
                  onEdit={() => setStep(resumeEventWizardStep(draft.steps))}
                />
              ) : (
                <p className="success-box">
                  Review your listing before approval.
                </p>
              )}
              {draft.readiness.ready ? (
                <p>
                  <Link
                    className="button-link"
                    href={`/dashboard/events/${draft.id}/preview`}
                    target={uploadActive ? "_blank" : undefined}
                    rel={uploadActive ? "noopener" : undefined}
                  >
                    Open exact listing preview
                  </Link>
                </p>
              ) : (
                <p>Complete the details above to preview your listing.</p>
              )}
              {draft.publication ? (
                <div className="success-box" role="status">
                  <strong>Your changes are live.</strong>
                  <p>
                    Saved details, schedule, and ready photos appear on your
                    published listing. No further payment is required.
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
                  <p>
                    Listing fees are non-refundable, including if you cancel
                    your event. You can cancel a published event from your
                    dashboard. Read the{" "}
                    <Link href="/terms">publishing terms</Link>.
                  </p>
                  <label className="checkbox-label">
                    <input type="checkbox" name="acceptedTerms" value="yes" />
                    <strong>
                      I accept publishing terms and approve this event for
                      payment.
                    </strong>
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
                        !draft.readiness.ready ||
                        hasPendingPhotos ||
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
              <img src={coverPhoto.urls.gallery} alt="Selected listing cover" />
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
                  {draft.privacyMode === "EXACT_ADDRESS"
                    ? "Full address visible"
                    : draft.privacyMode === "HIDDEN_UNTIL_START" &&
                        editorAddressRevealAt(draft)
                      ? `Hidden until ${formatSaleDay(editorAddressRevealAt(draft).slice(0, 10))}, ${formatSaleTime(editorAddressRevealAt(draft).slice(11, 16))} PT`
                      : draft.privacyMode
                        ? "Full address hidden"
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
