import "server-only";

import { Resend } from "resend";

import type { EmailGateway } from "../application/ports";
import { EmailProviderError } from "../domain/errors";
import type { EmailProviderMessage } from "../domain/types";

function providerFailure(error: unknown, fallback: string): never {
  if (error && typeof error === "object" && "message" in error) {
    throw new EmailProviderError(fallback, false);
  }
  throw new EmailProviderError(fallback, true);
}

export class ResendEmailGateway implements EmailGateway {
  private readonly client: Resend;
  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.client = new Resend(apiKey);
  }

  async send(message: EmailProviderMessage) {
    const response = await this.client.emails.send(
      {
        from: this.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        tags: Object.entries(message.tags ?? {}).map(([name, value]) => ({
          name,
          value,
        })),
      },
      { idempotencyKey: message.idempotencyKey },
    );
    if (response.error || !response.data?.id)
      providerFailure(response.error, "EMAIL_PROVIDER_REJECTED");
    return { id: response.data.id };
  }

  async createSegment(name: string) {
    const response = await this.client.segments.create({ name });
    if (response.error || !response.data?.id)
      providerFailure(response.error, "SEGMENT_CREATE_FAILED");
    return { id: response.data.id };
  }

  async importContacts(input: {
    segmentId: string;
    rows: readonly { email: string; firstName: string }[];
  }) {
    const csv = [
      "email,first_name",
      ...input.rows.map(
        (row) =>
          `${JSON.stringify(row.email)},${JSON.stringify(row.firstName)}`,
      ),
    ].join("\r\n");
    const response = await this.client.contacts.imports.create({
      file: new Blob([csv], { type: "text/csv" }),
      columnMap: { email: "email", firstName: "first_name" },
      onConflict: "skip",
      segments: [{ id: input.segmentId }],
    });
    if (response.error || !response.data?.id)
      providerFailure(response.error, "CONTACT_IMPORT_FAILED");
    return { id: response.data.id };
  }

  async getContactImportStatus(id: string) {
    const response = await this.client.contacts.imports.get(id);
    if (response.error || !response.data) {
      providerFailure(response.error, "CONTACT_IMPORT_STATUS_FAILED");
    }
    return response.data.status;
  }

  async createBroadcast(input: {
    name: string;
    subject: string;
    previewText?: string;
    html: string;
    text: string;
    segmentId: string;
  }) {
    const response = await this.client.broadcasts.create({
      from: this.from,
      name: input.name,
      subject: input.subject,
      ...(input.previewText ? { previewText: input.previewText } : {}),
      html: input.html,
      text: input.text,
      segmentId: input.segmentId,
      send: false,
    });
    if (response.error || !response.data?.id)
      providerFailure(response.error, "BROADCAST_CREATE_FAILED");
    return { id: response.data.id };
  }

  async sendBroadcast(id: string) {
    try {
      const response = await this.client.broadcasts.send(id);
      if (response.error) providerFailure(response.error, "BROADCAST_REJECTED");
    } catch (error) {
      if (error instanceof EmailProviderError) throw error;
      throw new EmailProviderError("BROADCAST_RESULT_AMBIGUOUS", true);
    }
  }

  async updateContactSubscription(email: string, subscribed: boolean) {
    const response = await this.client.contacts.update({
      email,
      unsubscribed: !subscribed,
    });
    if (response.error) {
      providerFailure(response.error, "CONTACT_SUBSCRIPTION_UPDATE_FAILED");
    }
  }

  verifyWebhook(payload: string, headers: Headers, secret: string) {
    return this.client.webhooks.verify({
      payload,
      headers: {
        id: headers.get("svix-id") ?? "",
        timestamp: headers.get("svix-timestamp") ?? "",
        signature: headers.get("svix-signature") ?? "",
      },
      webhookSecret: secret,
    });
  }
}
