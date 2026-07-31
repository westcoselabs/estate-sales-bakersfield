export type EmailTemplateKey =
  | "EMAIL_VERIFICATION"
  | "PASSWORD_RESET"
  | "PURCHASE_RECEIPT"
  | "RECENT_LISTINGS";

export type EmailTemplateCategory = "TRANSACTIONAL" | "MARKETING";

export type EmailCampaignStatus =
  | "DRAFT"
  | "PREPARING"
  | "READY"
  | "DISPATCHING"
  | "SENT"
  | "FAILED"
  | "NEEDS_REVIEW";

export interface EmailTemplateSummary {
  readonly id: string;
  readonly key: EmailTemplateKey | null;
  readonly name: string;
  readonly category: EmailTemplateCategory;
  readonly subject: string;
  readonly draftVersion: number;
  readonly activeRevision: number | null;
  readonly archivedAt: string | null;
  readonly updatedAt: string;
}

export interface EmailTemplateDetail extends EmailTemplateSummary {
  readonly html: string;
  readonly draftDigest: string;
  readonly lastTestedDigest: string | null;
  readonly lastTestedAt: string | null;
  readonly requiredVariables: readonly string[];
  readonly revisions: readonly {
    id: string;
    revisionNumber: number;
    subject: string;
    contentDigest: string;
    publishedAt: string;
  }[];
}

export interface RenderedEmail {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

export interface EmailProviderMessage extends RenderedEmail {
  readonly to: string;
  readonly idempotencyKey: string;
  readonly tags?: Readonly<Record<string, string>>;
}

export interface CampaignListingSnapshot {
  readonly eventId: string;
  readonly title: string;
  readonly path: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly city: string;
  readonly type: "ESTATE_SALE" | "YARD_SALE";
}

export interface EmailCampaignSummary {
  readonly id: string;
  readonly name: string;
  readonly subject: string;
  readonly status: EmailCampaignStatus;
  readonly recipientCount: number;
  readonly deliveredCount: number;
  readonly bouncedCount: number;
  readonly complainedCount: number;
  readonly suppressedCount: number;
  readonly version: number;
  readonly sentAt: string | null;
  readonly createdAt: string;
}

export interface AdminEmailTemplateRecord {
  id: string;
  key: EmailTemplateKey | null;
  name: string;
  category: EmailTemplateCategory;
  draftSubject: string;
  draftHtml: string;
  draftDigest: string;
  draftVersion: number;
  lastTestedDigest: string | null;
  lastTestedAt: Date | null;
  archivedAt: Date | null;
  updatedAt: Date;
  activeRevision: { id: string; revisionNumber: number } | null;
  revisions: {
    id: string;
    revisionNumber: number;
    subject: string;
    contentDigest: string;
    publishedAt: Date;
  }[];
}

export interface CampaignComposerOptions {
  templates: {
    id: string;
    revisionNumber: number;
    template: { name: string };
  }[];
  listings: {
    id: string;
    title: string | null;
    eventType: "ESTATE_SALE" | "YARD_SALE";
    startsAt: Date | null;
    endsAt: Date | null;
    publicId: string;
    slug: string;
    location: { city: string } | null;
    publication: { canonicalPath: string } | null;
  }[];
  users: { id: string; displayName: string; email: string }[];
}

export interface AdminEmailCampaignRecord {
  id: string;
  name: string;
  subject: string;
  previewText: string | null;
  status: EmailCampaignStatus;
  selectionMode: "ALL_ELIGIBLE" | "SELECTED_USERS";
  templateRevisionId: string;
  listingSnapshot: unknown;
  recipientCount: number;
  deliveredCount: number;
  bouncedCount: number;
  complainedCount: number;
  suppressedCount: number;
  version: number;
  testedAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
  templateRevision: {
    id: string;
    revisionNumber: number;
    subject: string;
    html: string;
    template: { name: string };
  };
  recipients: { user: { displayName: string; email: string } }[];
}

export interface AdminEmailCampaignSummaryRecord {
  id: string;
  name: string;
  subject: string;
  status: EmailCampaignStatus;
  recipientCount: number;
  version: number;
  sentAt: Date | null;
  createdAt: Date;
  templateRevision: { template: { name: string } };
}

export interface EmailDeliveryHistoryRecord {
  id: string;
  kind: "EMAIL_VERIFICATION" | "PASSWORD_RESET" | "PURCHASE_RECEIPT";
  status: string;
  attempts: number;
  sentAt: Date | null;
  deliveredAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
  paymentAttemptId: string | null;
  user: { displayName: string; email: string };
  templateRevision: {
    revisionNumber: number;
    template: { name: string };
  } | null;
}
