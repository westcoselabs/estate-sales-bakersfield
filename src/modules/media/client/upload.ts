import { upload } from "@vercel/blob/client";

export async function uploadPrivateMedia(input: {
  readonly pathname: string;
  readonly file: File;
  readonly handleUploadUrl: string;
  readonly clientPayload: string;
  readonly contentType: string;
  readonly abortSignal: AbortSignal;
  readonly onProgress: (percentage: number) => void;
}): Promise<{ readonly pathname: string }> {
  const result = await upload(input.pathname, input.file, {
    access: "private",
    handleUploadUrl: input.handleUploadUrl,
    clientPayload: input.clientPayload,
    contentType: input.contentType,
    abortSignal: input.abortSignal,
    onUploadProgress(progress) {
      input.onProgress(progress.percentage);
    },
  });
  return { pathname: result.pathname };
}
