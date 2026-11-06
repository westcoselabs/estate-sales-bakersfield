import "server-only";

import { Resend } from "resend";

import type { EmailGateway } from "../application/ports";
import { EmailApplicationError, EmailProviderError } from "../domain/errors";
import type { EmailProviderMessage } from "../domain/types";

function providerFailure(error: unknown, fallback: string): never {
  if (error && typeof error === "object" && "message" in error) {
    throw new EmailProviderError(fallback, false);
  }
  throw new EmailProviderError(fallback, true);
}

export class ResendEmailGateway implements EmailGateway {
  private readonly client: Resend;
  private readonly campaignClient: Resend;
  constructor(
    apiKey: string,
    private readonly from: string,
    campaignApiKey?: string,
  ) {
    this.client = new Resend(apiKey);
    this.campaignClient = campaignApiKey
      ? new Resend(campaignApiKey)
      : this.client;
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

  private nextRequestAt = 0;
  private async pace() {
    const now = Date.now();
    const delay = Math.max(0, this.nextRequestAt - now);
    this.nextRequestAt = now + delay + 600;
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  }

  async checkCampaignAccess() {
    const { data, error } = await this.campaignClient.segments.list({
      limit: 1,
    });
    if (
      error?.name === "restricted_api_key" ||
      error?.statusCode === 401 ||
      error?.statusCode === 403
    ) {
      throw new EmailApplicationError(
        "CAMPAIGN_PROVIDER_ACCESS_DENIED",
        "Resend denied campaign access. Set a Full access key as RESEND_CAMPAIGN_API_KEY in Production and redeploy.",
        503,
      );
    }
    if (error || !data) {
      throw new EmailApplicationError(
        "CAMPAIGN_PROVIDER_UNAVAILABLE",
        "Could not check Resend campaign access. Try again before queuing this send.",
        503,
      );
    }
  }

  async createSegment(name: string) {
    await this.pace();
    const response = await this.campaignClient.segments.create({ name });
    if (response.error || !response.data?.id)
      providerFailure(response.error, "SEGMENT_CREATE_FAILED");
    return { id: response.data.id };
  }

  async importContacts(input: {
    segmentId: string;
    rows: readonly { email: string; firstName: string }[];
  }) {
    await this.pace();
    const csvCell = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const csv = [
      "email,first_name",
      ...input.rows.map(
        (row) => `${csvCell(row.email)},${csvCell(row.firstName)}`,
      ),
    ].join("\r\n");
    const response = await this.campaignClient.contacts.imports.create({
      file: new Blob([csv], { type: "text/csv" }),
      columnMap: { email: "email", firstName: "first_name" },
      // Omit unsubscribed entirely: never reverse a provider opt-out.
      onConflict: "upsert",
      segments: [{ id: input.segmentId }],
    });
    if (response.error || !response.data?.id)
      providerFailure(response.error, "CONTACT_IMPORT_FAILED");
    return { id: response.data.id };
  }

  async getContactImportStatus(id: string) {
    await this.pace();
    const response = await this.campaignClient.contacts.imports.get(id);
    if (response.error || !response.data) {
      providerFailure(response.error, "CONTACT_IMPORT_STATUS_FAILED");
    }
    return response.data.status;
  }

  async listSegmentContacts(segmentId: string) {
    const contacts: { email: string; unsubscribed: boolean }[] = [];
    let after: string | undefined;
    do {
      await this.pace();
      const response = await this.campaignClient.contacts.list({
        segmentId,
        limit: 100,
        ...(after ? { after } : {}),
      });
      if (response.error || !response.data)
        providerFailure(response.error, "SEGMENT_READ_FAILED");
      contacts.push(
        ...response.data.data.map((contact) => ({
          email: contact.email.toLowerCase(),
          unsubscribed: contact.unsubscribed,
        })),
      );
      if (!response.data.has_more) return contacts;
      const lastId = response.data.data.at(-1)?.id;
      if (!lastId || lastId === after || contacts.length > 10000)
        throw new EmailProviderError("INVALID_SEGMENT_PAGINATION");
      after = lastId;
    } while (after);
    return contacts;
  }

  async removeContactFromSegment(segmentId: string, email: string) {
    await this.pace();
    const response = await this.campaignClient.contacts.segments.remove({
      email,
      segmentId,
    });
    if (response.error)
      providerFailure(response.error, "SEGMENT_REMOVE_FAILED");
  }

  async createBroadcast(input: {
    name: string;
    subject: string;
    previewText?: string;
    html: string;
    text: string;
    segmentId: string;
  }) {
    await this.pace();
    const response = await this.campaignClient.broadcasts.create({
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
    await this.pace();
    try {
      const response = await this.campaignClient.broadcasts.send(id);
      if (response.error) {
        const status = response.error.statusCode;
        throw new EmailProviderError(
          "BROADCAST_REJECTED",
          status === null || status >= 500,
        );
      }
      if (!response.data?.id || response.data.id !== id)
        throw new EmailProviderError("BROADCAST_RESULT_AMBIGUOUS", true);
    } catch (error) {
      if (error instanceof EmailProviderError) throw error;
      throw new EmailProviderError("BROADCAST_RESULT_AMBIGUOUS", true);
    }
  }

  async updateContactSubscription(email: string, subscribed: boolean) {
    const response = await this.campaignClient.contacts.update({
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
