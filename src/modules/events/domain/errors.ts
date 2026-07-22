export class EventError extends Error {}

export class EventNotFoundError extends EventError {}

export class EventConflictError extends EventError {
  constructor(
    message = "This draft changed in another tab. Reload and try again.",
  ) {
    super(message);
  }
}

export class EventValidationError extends EventError {}

export class EventStateError extends EventError {}

export class OrganizerOnboardingRequiredError extends EventError {}

export type PhotoProcessingStage =
  | "reservation_validation"
  | "upload_validation"
  | "source_read"
  | "image_decode"
  | "variant_write"
  | "variant_verify"
  | "staging_cleanup"
  | "database_transition";

export class PhotoProcessingError extends EventError {
  override readonly name = "PhotoProcessingError";

  constructor(
    message: string,
    readonly stage: PhotoProcessingStage,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
