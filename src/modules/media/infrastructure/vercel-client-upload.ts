import "server-only";

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

export interface VercelClientUploadAuthorization {
  readonly contentType: string;
  readonly maximumSizeInBytes: number;
  readonly expiresAt: Date;
}

export async function handleVercelClientUpload(input: {
  readonly request: Request;
  readonly body: HandleUploadBody;
  readonly token: string;
  readonly authorize: (
    pathname: string,
    clientPayload: string | null,
    multipart: boolean,
  ) => Promise<VercelClientUploadAuthorization>;
}) {
  return handleUpload({
    request: input.request,
    body: input.body,
    token: input.token,
    onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
      const authorization = await input.authorize(
        pathname,
        clientPayload,
        multipart,
      );
      return {
        allowedContentTypes: [authorization.contentType],
        maximumSizeInBytes: authorization.maximumSizeInBytes,
        validUntil: authorization.expiresAt.getTime(),
        addRandomSuffix: false,
        allowOverwrite: false,
      };
    },
  });
}
