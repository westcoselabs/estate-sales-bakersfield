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

export class PhotoProcessingError extends EventError {}
