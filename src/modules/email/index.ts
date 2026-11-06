export { EmailCenterService } from "./application/email-center";
export {
  createCampaignSchema,
  campaignPreviewSchema,
  updateCampaignSchema,
} from "./application/campaign-input";
export type {
  CreateCampaignInput,
  UpdateCampaignInput,
  ContactAudienceOption,
} from "./domain/types";
export { SYSTEM_EMAIL_DEFAULTS } from "./application/defaults";
export {
  createConfiguredEmailCenter,
  createConfiguredEmailGateway,
} from "./infrastructure/configured-email";
export { PrismaEmailCenterRepository } from "./infrastructure/prisma-email-center-repository";
export { ResendEmailGateway } from "./infrastructure/resend-email-gateway";
export { runConfiguredEmailJobBatch } from "./infrastructure/configured-email-jobs";
export { EmailApplicationError, EmailProviderError } from "./domain/errors";
export {
  emailContentDigest,
  escapeEmailHtml,
  parseCampaignListingSnapshot,
  renderEmailTemplate,
  renderRecentListingsHtml,
  sanitizeEmailHtml,
} from "./application/rendering";

export { suppressionRecipient } from "./application/webhook-suppression";
