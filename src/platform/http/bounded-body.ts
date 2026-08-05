export const DEFAULT_MAX_BODY_BYTES = 1_048_576;

export type BoundedBodyErrorCode = "PAYLOAD_TOO_LARGE" | "INVALID_BODY";

export class BoundedBodyError extends Error {
  override readonly name = "BoundedBodyError";

  constructor(
    readonly code: BoundedBodyErrorCode,
    readonly maxBytes: number,
  ) {
    super(
      code === "PAYLOAD_TOO_LARGE"
        ? "The request body is too large."
        : "The request body is invalid.",
    );
  }
}

export interface BoundedBodyOptions {
  readonly maxBytes?: number;
}

function bodyError(
  code: BoundedBodyErrorCode,
  maxBytes: number,
): BoundedBodyError {
  return new BoundedBodyError(code, maxBytes);
}

function assertMaximum(maxBytes: number): void {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new Error("The request body byte limit is invalid");
  }
}

function contentLengthFrom(request: Request, maxBytes: number): number | null {
  const raw = request.headers.get("content-length");
  if (raw === null) return null;
  if (!/^\d+$/.test(raw)) {
    throw bodyError("INVALID_BODY", maxBytes);
  }
  const length = Number(raw);
  if (!Number.isSafeInteger(length)) {
    throw bodyError("INVALID_BODY", maxBytes);
  }
  return length;
}

async function cancelStream(
  stream: ReadableStream<Uint8Array> | null,
): Promise<void> {
  if (!stream || stream.locked) return;
  try {
    await stream.cancel();
  } catch {
    // The safe body error is authoritative even if the source cannot cancel.
  }
}

async function cancelReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // The safe body error is authoritative even if the source cannot cancel.
  }
}

export async function readBoundedText(
  request: Request,
  options: BoundedBodyOptions = {},
): Promise<string> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BODY_BYTES;
  assertMaximum(maxBytes);

  let declaredLength: number;
  try {
    declaredLength = contentLengthFrom(request, maxBytes) ?? 0;
  } catch (error) {
    await cancelStream(request.body);
    throw error;
  }
  if (declaredLength > maxBytes) {
    await cancelStream(request.body);
    throw bodyError("PAYLOAD_TOO_LARGE", maxBytes);
  }

  const stream = request.body;
  if (!stream) {
    if (declaredLength > 0) {
      throw bodyError("INVALID_BODY", maxBytes);
    }
    return "";
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let byteCount = 0;
  let text = "";

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!(chunk.value instanceof Uint8Array)) {
        await cancelReader(reader);
        throw bodyError("INVALID_BODY", maxBytes);
      }
      byteCount += chunk.value.byteLength;
      if (byteCount > maxBytes) {
        await cancelReader(reader);
        throw bodyError("PAYLOAD_TOO_LARGE", maxBytes);
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } catch (error) {
    if (error instanceof BoundedBodyError) throw error;
    await cancelReader(reader);
    throw bodyError("INVALID_BODY", maxBytes);
  } finally {
    reader.releaseLock();
  }
}
