import "server-only";

import { appendFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import type {
  AuthenticationEmailMessage,
  EmailService,
} from "../application/ports";

export class FileCaptureEmailService implements EmailService {
  private readonly path: string;

  constructor(path: string) {
    if (!["local", "test"].includes(process.env.APP_ENV ?? "")) {
      throw new Error(
        "The authentication email capture adapter is local/test-only",
      );
    }
    const captureRoot = resolve(".tmp");
    const resolvedPath = resolve(path);
    const relativePath = relative(captureRoot, resolvedPath);
    if (
      !relativePath ||
      relativePath.startsWith("..") ||
      isAbsolute(relativePath)
    ) {
      throw new Error("Authentication email captures must stay inside .tmp");
    }
    this.path = resolvedPath;
  }

  async send(
    message: AuthenticationEmailMessage,
  ): Promise<{ readonly providerMessageId: string }> {
    const providerMessageId = `test-${crypto.randomUUID()}`;
    await appendFile(
      this.path,
      `${JSON.stringify({ ...message, providerMessageId })}\n`,
      { encoding: "utf8" },
    );
    return { providerMessageId };
  }
}
