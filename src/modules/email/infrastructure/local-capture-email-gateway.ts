import "server-only";

import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import type { EmailGateway } from "../application/ports";
import type { EmailProviderMessage } from "../domain/types";
import { EmailApplicationError } from "../domain/errors";

export class LocalCaptureEmailGateway implements EmailGateway {
  constructor(private readonly capturePath: string) {}

  async send(message: EmailProviderMessage) {
    await mkdir(path.dirname(this.capturePath), { recursive: true });
    const id = `capture-${crypto.randomUUID()}`;
    await appendFile(
      this.capturePath,
      `${JSON.stringify({
        kind: "ADMIN_EMAIL_TEST",
        id,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      })}\n`,
      "utf8",
    );
    return { id };
  }

  private unsupported(): never {
    throw new EmailApplicationError(
      "CAMPAIGN_PROVIDER_UNAVAILABLE",
      "Campaign provider operations are unavailable in local capture mode.",
      503,
    );
  }
  createSegment(): Promise<never> {
    return Promise.reject(this.unsupported());
  }
  importContacts(): Promise<never> {
    return Promise.reject(this.unsupported());
  }
  getContactImportStatus(): Promise<never> {
    return Promise.reject(this.unsupported());
  }
  createBroadcast(): Promise<never> {
    return Promise.reject(this.unsupported());
  }
  sendBroadcast(): Promise<never> {
    return Promise.reject(this.unsupported());
  }
  updateContactSubscription(): Promise<never> {
    return Promise.reject(this.unsupported());
  }
}
