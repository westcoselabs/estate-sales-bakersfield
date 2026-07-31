import type { CurrentSession } from "@/modules/auth";
import {
  requireRecentSuperAdminSession,
  requireSuperAdminPrincipal,
} from "@/modules/auth";

import { SYSTEM_EMAIL_DEFAULTS } from "./defaults";
import type { EmailCenterPort, EmailGateway } from "./ports";
import {
  assertRequiredVariables,
  parseCampaignListingSnapshot,
  renderEmailTemplate,
  renderRecentListingsHtml,
  sanitizeEmailHtml,
} from "./rendering";
import { EmailApplicationError } from "../domain/errors";

export class EmailCenterService {
  constructor(
    private readonly repository: EmailCenterPort,
    private readonly gateway: EmailGateway,
    private readonly applicationUrl: string,
    private readonly campaignDispatchEnabled: boolean,
  ) {}

  listTemplates(session: CurrentSession | null) {
    requireSuperAdminPrincipal(session?.principal ?? null);
    return this.repository.listTemplates();
  }

  getTemplate(session: CurrentSession | null, id: string) {
    requireSuperAdminPrincipal(session?.principal ?? null);
    return this.repository.getTemplate(id);
  }

  createTemplate(
    session: CurrentSession | null,
    input: { name: string; subject: string; html: string },
    requestId?: string,
  ) {
    const actor = requireSuperAdminPrincipal(session?.principal ?? null);
    return this.repository.createTemplate({
      ...input,
      actorId: actor.id,
      ...(requestId ? { requestId } : {}),
    });
  }

  saveDraft(
    session: CurrentSession | null,
    id: string,
    input: { subject: string; html: string; expectedVersion: number },
  ) {
    requireSuperAdminPrincipal(session?.principal ?? null);
    const html = sanitizeEmailHtml(input.html);
    if (!input.subject.trim())
      throw new EmailApplicationError(
        "SUBJECT_REQUIRED",
        "Email subject is required.",
        400,
      );
    return this.repository.saveDraft({
      id,
      subject: input.subject.trim(),
      html,
      expectedVersion: input.expectedVersion,
    });
  }

  async testTemplate(
    session: CurrentSession | null,
    id: string,
    requestId?: string,
  ) {
    const actor = requireSuperAdminPrincipal(session?.principal ?? null);
    const template = await this.repository.getTemplate(id);
    if (!template)
      throw new EmailApplicationError(
        "TEMPLATE_NOT_FOUND",
        "Email template not found.",
        404,
      );
    const key = template.key;
    const required = key
      ? SYSTEM_EMAIL_DEFAULTS[key].requiredVariables
      : ["RECENT_LISTINGS_HTML", "RESEND_UNSUBSCRIBE_URL"];
    assertRequiredVariables(template.draftHtml, required);
    const sampleValues = {
      DISPLAY_NAME: actor.displayName,
      ACTION_URL: `${this.applicationUrl}/verify-email?token=sample`,
      EXPIRY: "30 minutes",
      EVENT_TITLE: "Vintage Home Estate Sale",
      AMOUNT: "$49.00",
      CURRENCY: "USD",
      PAID_AT: new Date().toISOString(),
      PAYMENT_REFERENCE: "PAY-DEMO",
      LISTING_STATUS: "Your listing is ready.",
      LISTING_URL: `${this.applicationUrl}/dashboard`,
      RESEND_UNSUBSCRIBE_URL: `${this.applicationUrl}/unsubscribe?token=sample`,
    };
    const rendered = renderEmailTemplate({
      subject: template.draftSubject,
      html: template.draftHtml.replaceAll(
        "{{{contact.first_name|there}}}",
        actor.displayName,
      ),
      values: sampleValues,
      trustedHtml: {
        RECENT_LISTINGS_HTML:
          "<p><strong>Preview listing</strong> · Bakersfield</p>",
      },
      text: "Estate Sales Bakersfield email preview.",
    });
    await this.gateway.send({
      ...rendered,
      to: actor.email,
      idempotencyKey: `template-test-${template.draftDigest}-${requestId ?? actor.id}`,
      tags: { type: "template-test" },
    });
    await this.repository.markTested({
      id,
      digest: template.draftDigest,
      testedAt: new Date(),
      actorId: actor.id,
      ...(requestId ? { requestId } : {}),
    });
  }

  publish(
    session: CurrentSession | null,
    id: string,
    input: { expectedVersion: number; confirmation: string },
    requestId?: string,
  ) {
    const recent = requireRecentSuperAdminSession(session);
    if (input.confirmation !== "PUBLISH")
      throw new EmailApplicationError(
        "INVALID_CONFIRMATION",
        "Type PUBLISH to confirm.",
        400,
      );
    return this.repository.publish({
      id,
      expectedVersion: input.expectedVersion,
      actorId: recent.principal.id,
      now: new Date(),
      ...(requestId ? { requestId } : {}),
    });
  }

  rollback(
    session: CurrentSession | null,
    id: string,
    revisionId: string,
    requestId?: string,
  ) {
    const recent = requireRecentSuperAdminSession(session);
    return this.repository.rollback({
      id,
      revisionId,
      actorId: recent.principal.id,
      ...(requestId ? { requestId } : {}),
    });
  }

  archive(session: CurrentSession | null, id: string, requestId?: string) {
    const recent = requireRecentSuperAdminSession(session);
    return this.repository.archive({
      id,
      actorId: recent.principal.id,
      ...(requestId ? { requestId } : {}),
    });
  }

  listCampaigns(session: CurrentSession | null) {
    requireSuperAdminPrincipal(session?.principal ?? null);
    return this.repository.listCampaigns();
  }

  campaignComposerOptions(session: CurrentSession | null) {
    requireSuperAdminPrincipal(session?.principal ?? null);
    return this.repository.campaignComposerOptions();
  }

  createCampaign(
    session: CurrentSession | null,
    input: {
      name: string;
      subject: string;
      previewText?: string;
      templateRevisionId: string;
      listingIds: string[];
      selectionMode: "ALL_ELIGIBLE" | "SELECTED_USERS";
      selectedUserIds: string[];
    },
    requestId?: string,
  ) {
    const actor = requireSuperAdminPrincipal(session?.principal ?? null);
    return this.repository.createCampaign({
      ...input,
      actorId: actor.id,
      ...(requestId ? { requestId } : {}),
    });
  }

  updateCampaign(
    session: CurrentSession | null,
    id: string,
    input: {
      expectedVersion: number;
      name: string;
      subject: string;
      previewText?: string;
    },
    requestId?: string,
  ) {
    const actor = requireSuperAdminPrincipal(session?.principal ?? null);
    return this.repository.updateCampaign({
      id,
      ...input,
      actorId: actor.id,
      ...(requestId ? { requestId } : {}),
    });
  }

  getCampaign(session: CurrentSession | null, id: string) {
    requireSuperAdminPrincipal(session?.principal ?? null);
    return this.repository.getCampaign(id);
  }

  listDeliveryHistory(session: CurrentSession | null) {
    requireSuperAdminPrincipal(session?.principal ?? null);
    return this.repository.listDeliveryHistory();
  }

  async testCampaign(
    session: CurrentSession | null,
    id: string,
    requestId?: string,
  ) {
    const actor = requireSuperAdminPrincipal(session?.principal ?? null);
    const campaign = await this.repository.getCampaign(id);
    if (!campaign)
      throw new EmailApplicationError(
        "CAMPAIGN_NOT_FOUND",
        "Email campaign not found.",
        404,
      );
    const listings = parseCampaignListingSnapshot(campaign.listingSnapshot);
    const rendered = renderEmailTemplate({
      subject: campaign.subject,
      html: campaign.templateRevision.html.replaceAll(
        "{{{contact.first_name|there}}}",
        actor.displayName,
      ),
      values: {
        RESEND_UNSUBSCRIBE_URL: `${this.applicationUrl}/unsubscribe?token=sample`,
      },
      trustedHtml: {
        RECENT_LISTINGS_HTML: renderRecentListingsHtml(
          listings,
          this.applicationUrl,
        ),
      },
      text: `Recent estate sales: ${listings.map((listing) => listing.title).join(", ")}`,
    });
    await this.gateway.send({
      ...rendered,
      to: actor.email,
      idempotencyKey: `campaign-test-${campaign.id}-${campaign.version}-${requestId ?? actor.id}`,
      tags: { type: "campaign-test" },
    });
    await this.repository.markCampaignTested(id, actor.id, requestId);
  }

  sendCampaign(
    session: CurrentSession | null,
    id: string,
    input: { expectedVersion: number; confirmation: string },
    requestId?: string,
  ) {
    if (!this.campaignDispatchEnabled) {
      throw new EmailApplicationError(
        "CAMPAIGNS_DISABLED",
        "Campaign dispatch is disabled in this environment. Test sends remain available.",
        409,
      );
    }
    const recent = requireRecentSuperAdminSession(session);
    if (input.confirmation !== "SEND")
      throw new EmailApplicationError(
        "INVALID_CONFIRMATION",
        "Type SEND to confirm.",
        400,
      );
    return this.repository.prepareCampaign({
      id,
      expectedVersion: input.expectedVersion,
      actorId: recent.principal.id,
      ...(requestId ? { requestId } : {}),
    });
  }
}
