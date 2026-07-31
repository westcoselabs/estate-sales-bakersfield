export class AdminApplicationError extends Error {
  override readonly name: string = "AdminApplicationError";

  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class AdminNotFoundError extends AdminApplicationError {
  override readonly name = "AdminNotFoundError";

  constructor(message = "The requested record was not found.") {
    super("NOT_FOUND", 404, message);
  }
}

export class AdminConflictError extends AdminApplicationError {
  override readonly name = "AdminConflictError";

  constructor(code: string, message: string) {
    super(code, 409, message);
  }
}

export class AdminExportLimitError extends AdminApplicationError {
  override readonly name = "AdminExportLimitError";

  constructor() {
    super(
      "EXPORT_LIMIT_EXCEEDED",
      422,
      "More than 10,000 contacts match. Narrow the search and try again.",
    );
  }
}
