export class EmailApplicationError extends Error {
  override readonly name = "EmailApplicationError";

  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class EmailProviderError extends Error {
  override readonly name = "EmailProviderError";

  constructor(
    readonly code: string,
    readonly ambiguous = false,
  ) {
    super("The email provider could not complete the request");
  }
}
