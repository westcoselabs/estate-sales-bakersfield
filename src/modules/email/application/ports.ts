import type {
  AdminEmailCampaignRecord,
  AdminEmailCampaignSummaryRecord,
  AdminEmailTemplateRecord,
  CampaignComposerOptions,
  EmailDeliveryHistoryRecord,
  EmailProviderMessage,
} from "../domain/types";

export interface EmailGateway {
  send(message: EmailProviderMessage): Promise<{ id: string }>;
  createSegment(name: string): Promise<{ id: string }>;
  importContacts(input: {
    segmentId: string;
    rows: readonly { email: string; firstName: string }[];
  }): Promise<{ id: string }>;
  getContactImportStatus(
    id: string,
  ): Promise<"queued" | "in_progress" | "completed" | "failed">;
  createBroadcast(input: {
    name: string;
    subject: string;
    previewText?: string;
    html: string;
    text: string;
    segmentId: string;
  }): Promise<{ id: string }>;
  sendBroadcast(id: string): Promise<void>;
  updateContactSubscription(email: string, subscribed: boolean): Promise<void>;
}

export interface EmailCenterPort {
  listTemplates(): Promise<AdminEmailTemplateRecord[]>;
  getTemplate(id: string): Promise<AdminEmailTemplateRecord | null>;
  createTemplate(input: {
    name: string;
    subject: string;
    html: string;
    actorId: string;
    requestId?: string;
  }): Promise<{ id: string }>;
  saveDraft(input: {
    id: string;
    subject: string;
    html: string;
    expectedVersion: number;
  }): Promise<AdminEmailTemplateRecord | null>;
  markTested(input: {
    id: string;
    digest: string;
    testedAt: Date;
    actorId: string;
    requestId?: string;
  }): Promise<void>;
  publish(input: {
    id: string;
    expectedVersion: number;
    actorId: string;
    requestId?: string;
    now: Date;
  }): Promise<unknown>;
  rollback(input: {
    id: string;
    revisionId: string;
    actorId: string;
    requestId?: string;
  }): Promise<void>;
  archive(input: {
    id: string;
    actorId: string;
    requestId?: string;
  }): Promise<void>;
  listCampaigns(): Promise<AdminEmailCampaignSummaryRecord[]>;
  campaignComposerOptions(): Promise<CampaignComposerOptions>;
  createCampaign(input: {
    name: string;
    subject: string;
    previewText?: string;
    templateRevisionId: string;
    listingIds: string[];
    selectionMode: "ALL_ELIGIBLE" | "SELECTED_USERS";
    selectedUserIds: string[];
    actorId: string;
    requestId?: string;
  }): Promise<{ id: string }>;
  updateCampaign(input: {
    id: string;
    expectedVersion: number;
    name: string;
    subject: string;
    previewText?: string;
    actorId: string;
    requestId?: string;
  }): Promise<void>;
  getCampaign(id: string): Promise<AdminEmailCampaignRecord | null>;
  listDeliveryHistory(): Promise<EmailDeliveryHistoryRecord[]>;
  markCampaignTested(
    id: string,
    actorId: string,
    requestId?: string,
  ): Promise<void>;
  prepareCampaign(input: {
    id: string;
    expectedVersion: number;
    actorId: string;
    requestId?: string;
  }): Promise<{ recipientCount: number }>;
}
