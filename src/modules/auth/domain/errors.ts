export class AuthenticationError extends Error {
  override readonly name: string = "AuthenticationError";
}

export class AuthorizationError extends Error {
  override readonly name: string = "AuthorizationError";
}

export class EmailVerificationRequiredError extends AuthorizationError {
  override readonly name: string = "EmailVerificationRequiredError";
}

export class InvalidPasswordError extends Error {
  override readonly name = "InvalidPasswordError";
}

export class MalformedPasswordHashError extends Error {
  override readonly name = "MalformedPasswordHashError";
}

export class InvalidCredentialsError extends AuthenticationError {
  override readonly name = "InvalidCredentialsError";
}

export class InvalidTokenError extends AuthenticationError {
  override readonly name = "InvalidTokenError";
}

export class AccountConflictError extends AuthenticationError {
  override readonly name = "AccountConflictError";
}

export class RateLimitExceededError extends Error {
  override readonly name = "RateLimitExceededError";

  constructor(
    readonly retryAfterSeconds: number,
    message = "The request cannot be completed right now",
  ) {
    super(message);
  }
}

export class AuthenticationServiceUnavailableError extends Error {
  override readonly name = "AuthenticationServiceUnavailableError";
}

export class EmailDeliveryError extends Error {
  override readonly name = "EmailDeliveryError";

  constructor(
    readonly code: string,
    options?: ErrorOptions,
  ) {
    super("Transactional email delivery failed", options);
  }
}
