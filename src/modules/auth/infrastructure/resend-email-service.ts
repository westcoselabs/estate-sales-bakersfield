import "server-only";

import { Resend } from "resend";

import { logger } from "@/platform/observability/logger";

import type {
  AuthenticationEmailMessage,
  EmailService,
} from "../application/ports";
import { EmailDeliveryError } from "../domain/errors";

interface ResendClient {
  readonly emails: {
    send(
      payload: {
        readonly from: string;
        readonly to: string[];
        readonly subject: string;
        readonly text: string;
        readonly html: string;
      },
      options: { readonly idempotencyKey: string },
    ): Promise<{
      readonly data: { readonly id: string } | null;
      readonly error: { readonly name: string } | null;
    }>;
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Readonly<Record<string, string>> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

export function renderAuthenticationEmail(message: AuthenticationEmailMessage) {
  const verification = message.kind === "EMAIL_VERIFICATION";
  const subject = verification
    ? "Verify your Estate Sales Bakersfield email"
    : "Reset your Estate Sales Bakersfield password";
  const action = verification ? "Verify email" : "Reset password";
  const expiry = verification ? "24 hours" : "1 hour";
  const text = [
    `Hello ${message.displayName},`,
    "",
    `${action} using this secure link:`,
    message.actionUrl,
    "",
    `This link expires in ${expiry} and can be used once.`,
    "If you did not request this, you can ignore this message.",
  ].join("\n");
  const html = [
    `<p>Hello ${escapeHtml(message.displayName)},</p>`,
    `<p><a href="${escapeHtml(message.actionUrl)}">${action}</a></p>`,
    `<p>This link expires in ${expiry} and can be used once.</p>`,
    "<p>If you did not request this, you can ignore this message.</p>",
  ].join("");
  return { subject, text, html };
}

export class ResendEmailService implements EmailService {
  private readonly client: ResendClient;

  constructor(
    private readonly from: string,
    apiKey: string,
    client?: ResendClient,
  ) {
    this.client = client ?? new Resend(apiKey);
  }

  async send(
    message: AuthenticationEmailMessage,
  ): Promise<{ readonly providerMessageId: string }> {
    const content = renderAuthenticationEmail(message);
    const result = await this.client.emails.send(
      {
        from: this.from,
        to: [message.to],
        ...content,
      },
      { idempotencyKey: message.idempotencyKey },
    );
    if (result.error || !result.data) {
      const code = result.error?.name ?? "RESEND_EMPTY_RESPONSE";
      logger.warn(
        { provider: "resend", code, kind: message.kind },
        "Transactional email provider rejected a message",
      );
      throw new EmailDeliveryError(code);
    }
    return { providerMessageId: result.data.id };
  }
}
