import { upload } from "@vercel/blob/client";

export type PhotoUploadFailureCode =
  | "POLICY_BLOCKED"
  | "TOKEN_PERMISSION_FAILED"
  | "TRANSFER_ABORTED"
  | "TRANSFER_FAILED";

export class PhotoUploadError extends Error {
  constructor(
    readonly code: PhotoUploadFailureCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "PhotoUploadError";
  }
}

export function classifyPhotoUploadError(
  error: unknown,
  policyBlocked: boolean,
): PhotoUploadError {
  if (error instanceof PhotoUploadError) return error;
  if (policyBlocked) {
    return new PhotoUploadError(
      "POLICY_BLOCKED",
      "Upload blocked by the browser security policy. Reload the page after the upload policy is corrected.",
      { cause: error },
    );
  }
  const providerMessage =
    error instanceof Error
      ? `${error.name} ${error.message}`.toLowerCase().replace(/\s+/g, " ")
      : "";
  if (
    providerMessage.includes("retrieve the client token") ||
    providerMessage.includes("client token expired")
  ) {
    return new PhotoUploadError(
      "TOKEN_PERMISSION_FAILED",
      "Upload permission failed. Refresh the page and try again.",
      { cause: error },
    );
  }
  if (
    providerMessage.includes("request was aborted") ||
    providerMessage.includes("aborterror")
  ) {
    return new PhotoUploadError(
      "TRANSFER_ABORTED",
      "The Blob transfer was canceled before it completed.",
      { cause: error },
    );
  }
  return new PhotoUploadError(
    "TRANSFER_FAILED",
    "The Blob transfer failed. Check your connection and retry.",
    { cause: error },
  );
}

export async function uploadPrivateMedia(input: {
  readonly pathname: string;
  readonly file: File;
  readonly handleUploadUrl: string;
  readonly clientPayload: string;
  readonly contentType: string;
  readonly abortSignal: AbortSignal;
  readonly onProgress: (percentage: number) => void;
}): Promise<{ readonly pathname: string }> {
  let policyBlocked = false;
  const transferController = new AbortController();
  const abortTransfer = () => transferController.abort();
  const policyViolation = (event: Event) => {
    const violation = event as SecurityPolicyViolationEvent;
    if (
      violation.effectiveDirective === "connect-src" &&
      violation.blockedURI.startsWith("https://vercel.com")
    ) {
      policyBlocked = true;
      transferController.abort();
    }
  };
  const policyTarget = typeof document === "undefined" ? null : document;
  if (input.abortSignal.aborted) {
    abortTransfer();
  } else {
    input.abortSignal.addEventListener("abort", abortTransfer, { once: true });
  }
  policyTarget?.addEventListener("securitypolicyviolation", policyViolation);
  try {
    const result = await upload(input.pathname, input.file, {
      access: "private",
      handleUploadUrl: input.handleUploadUrl,
      clientPayload: input.clientPayload,
      contentType: input.contentType,
      abortSignal: transferController.signal,
      onUploadProgress(progress) {
        input.onProgress(progress.percentage);
      },
    });
    return { pathname: result.pathname };
  } catch (error) {
    throw classifyPhotoUploadError(error, policyBlocked);
  } finally {
    input.abortSignal.removeEventListener("abort", abortTransfer);
    policyTarget?.removeEventListener(
      "securitypolicyviolation",
      policyViolation,
    );
  }
}
