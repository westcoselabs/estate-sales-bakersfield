export class AuthenticationError extends Error {
  override readonly name = "AuthenticationError";
}

export class AuthorizationError extends Error {
  override readonly name = "AuthorizationError";
}

export class InvalidPasswordError extends Error {
  override readonly name = "InvalidPasswordError";
}
