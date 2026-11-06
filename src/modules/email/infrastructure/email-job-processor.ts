import "server-only";

import { hasExplicitMarketingConsent } from "@/modules/auth";

import type { PrismaClient } from "@/generated/prisma/client";
import type { ServerEnvironment } from "@/platform/config/env";

import { SYSTEM_EMAIL_DEFAULTS } from "../application/defaults";
import type { EmailGateway } from "../application/ports";
import {
  renderEmailTemplate,
  renderRecentListingsHtml,
} from "../application/rendering";
import { EmailProviderError } from "../domain/errors";
import type { CampaignListingSnapshot } from "../domain/types";
import { eligibleAudienceContacts } from "./contact-audiences";
import {
  assertRequiredVariables,
  sanitizeEmailHtml,
} from "../application/rendering";

export class EmailJobProcessor {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly gateway: EmailGateway,
    private readonly environment: ServerEnvironment,
  ) {}

  async sendReceipt(deliveryId: string) {
    const delivery = await this.prisma.emailDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        user: { select: { displayName: true, email: true } },
        templateRevision: true,
        paymentAttempt: {
          include: {
            event: { select: { id: true, title: true } },
            publication: { select: { canonicalPath: true } },
          },
        },
      },
    });
    if (!delivery?.paymentAttempt)
      throw new Error("RECEIPT_DELIVERY_NOT_FOUND");
    if (["SENT", "DELIVERED"].includes(delivery.status)) return;
    const attempt = delivery.paymentAttempt;
    const fallback = SYSTEM_EMAIL_DEFAULTS.PURCHASE_RECEIPT;
    const subject = delivery.templateRevision?.subject ?? fallback.subject;
    const html = delivery.templateRevision?.html ?? fallback.html;
    const amount = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: attempt.expectedCurrency.toUpperCase(),
    }).format(attempt.expectedAmount / 100);
    const listingUrl = new URL(
      attempt.publication?.canonicalPath ??
        `/dashboard/events/${attempt.event.id}`,
      this.environment.APP_URL,
    ).toString();
    const status =
      attempt.fulfillmentState === "FULFILLED"
        ? "Your listing was published successfully."
        : "Your payment is confirmed. Your listing needs follow-up before publication, and our team will retain the payment record while it is reviewed.";
    const rendered = renderEmailTemplate({
      subject,
      html,
      values: {
        DISPLAY_NAME: delivery.user.displayName,
        EVENT_TITLE: attempt.event.title ?? "Estate sale listing",
        AMOUNT: amount,
        CURRENCY: attempt.expectedCurrency.toUpperCase(),
        PAID_AT: (attempt.paidAt ?? delivery.createdAt).toISOString(),
        PAYMENT_REFERENCE: attempt.id,
        LISTING_STATUS: status,
        LISTING_URL: listingUrl,
      },
      text: `${amount} ${attempt.expectedCurrency.toUpperCase()} received for ${attempt.event.title ?? "your listing"}. ${status} Reference: ${attempt.id}`,
    });
    try {
      const sent = await this.gateway.send({
        ...rendered,
        to: delivery.user.email,
        idempotencyKey: `purchase-receipt-${attempt.id}`,
        tags: { type: "purchase-receipt" },
      });
      await this.prisma.emailDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "SENT",
          providerMessageId: sent.id,
          sentAt: new Date(),
          attempts: { increment: 1 },
          lastErrorCode: null,
        },
      });
    } catch (error) {
      await this.prisma.emailDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          attempts: { increment: 1 },
          lastErrorCode:
            error instanceof Error
              ? error.name.slice(0, 100)
              : "EMAIL_SEND_FAILED",
        },
      });
      throw error;
    }
  }

  private async campaignRecipients(campaign: {
    id: string;
    selectionMode: string;
    contactCategory: string | null;
    contactSourceTag: string | null;
  }) {
    if (campaign.selectionMode === "CONTACT_SEGMENT") {
      return eligibleAudienceContacts(this.prisma, {
        category: campaign.contactCategory!,
        sourceTag: campaign.contactSourceTag!,
        campaignId: campaign.id,
      });
    }
    const rows = await this.prisma.emailCampaignRecipient.findMany({
      where: { campaignId: campaign.id },
      include: { user: { include: { marketingPreference: true } } },
    });
    return rows
      .filter(
        ({ user }) =>
          user.role === "USER" &&
          user.status === "ACTIVE" &&
          user.emailVerifiedAt &&
          hasExplicitMarketingConsent(user.marketingPreference),
      )
      .map(({ user }) => ({
        id: user.id,
        email: user.email.toLowerCase(),
        firstName: user.displayName,
      }));
  }

  async sendCampaign(campaignId: string) {
    const campaign = await this.prisma.emailCampaign.findUnique({
      where: { id: campaignId },
      include: { templateRevision: true },
    });
    if (!campaign) return;
    // A worker that died after crossing the dispatch boundary must never resend.
    if (campaign.status === "DISPATCHING") {
      await this.prisma.emailCampaign.updateMany({
        where: { id: campaign.id, status: "DISPATCHING" },
        data: { status: "NEEDS_REVIEW", lastErrorCode: "DISPATCH_INTERRUPTED" },
      });
      return;
    }
    if (campaign.status !== "PREPARING") return;
    if (
      this.environment.APP_ENV !== "production" ||
      !this.environment.EMAIL_CAMPAIGNS_ENABLED ||
      this.environment.RESEND_RESOURCE_ENV !== "production"
    ) {
      await this.prisma.emailCampaign.updateMany({
        where: { id: campaign.id, status: "PREPARING" },
        data: { status: "FAILED", lastErrorCode: "CAMPAIGNS_DISABLED" },
      });
      return;
    }
    let dispatchClaimed = false;
    let providerAcceptedDispatch = false;
    try {
      const recipients = await this.campaignRecipients(campaign);
      if (!recipients.length || recipients.length > 10000)
        throw new EmailProviderError("INVALID_FINAL_AUDIENCE");
      const listings =
        campaign.listingSnapshot as unknown as CampaignListingSnapshot[];
      const html = sanitizeEmailHtml(
        campaign.draftHtml ?? campaign.templateRevision?.html ?? "",
      );
      assertRequiredVariables(html, ["RESEND_UNSUBSCRIBE_URL"]);
      const rendered = renderEmailTemplate({
        subject: campaign.subject,
        html,
        values: {},
        trustedHtml: {
          RECENT_LISTINGS_HTML: renderRecentListingsHtml(
            listings,
            this.environment.APP_URL,
          ),
          RESEND_UNSUBSCRIBE_URL: "{{{RESEND_UNSUBSCRIBE_URL}}}",
        },
        text: `Explore estate sales: ${listings.map((listing) => `${listing.title}: ${new URL(listing.path, this.environment.APP_URL)}`).join(". ")}. Unsubscribe: {{{RESEND_UNSUBSCRIBE_URL}}}`,
      });
      const segmentId =
        campaign.providerSegmentId ??
        (await this.gateway.createSegment(`Campaign ${campaign.id}`)).id;
      if (!campaign.providerSegmentId)
        await this.prisma.emailCampaign.update({
          where: { id: campaign.id },
          data: { providerSegmentId: segmentId },
        });
      const importId =
        campaign.providerContactImportId ??
        (await this.gateway.importContacts({ segmentId, rows: recipients })).id;
      if (!campaign.providerContactImportId) {
        await this.prisma.emailCampaign.update({
          where: { id: campaign.id },
          data: { providerContactImportId: importId },
        });
        throw new Error("CONTACT_IMPORT_PENDING");
      }
      const importStatus = await this.gateway.getContactImportStatus(importId);
      if (importStatus === "failed")
        throw new EmailProviderError("CONTACT_IMPORT_FAILED");
      if (importStatus !== "completed") {
        if (Date.now() - campaign.updatedAt.getTime() > 30 * 60 * 1000)
          throw new EmailProviderError("CONTACT_IMPORT_TIMEOUT");
        throw new Error("CONTACT_IMPORT_PENDING");
      }
      const current = new Set(recipients.map((row) => row.email));
      let providerContacts = await this.gateway.listSegmentContacts(segmentId);
      // Never send to a contact who became ineligible while the asynchronous import ran.
      for (const contact of providerContacts) {
        if (!current.has(contact.email))
          await this.gateway.removeContactFromSegment(segmentId, contact.email);
      }
      if (providerContacts.some((contact) => !current.has(contact.email)))
        providerContacts = await this.gateway.listSegmentContacts(segmentId);
      const providerEmails = new Set(providerContacts.map((row) => row.email));
      if (
        providerEmails.size !== current.size ||
        [...current].some((email) => !providerEmails.has(email))
      )
        throw new EmailProviderError("PROVIDER_AUDIENCE_MISMATCH");
      const sendable = providerContacts.filter((row) => !row.unsubscribed);
      if (!sendable.length)
        throw new EmailProviderError("INVALID_FINAL_AUDIENCE");
      const broadcastId =
        campaign.providerBroadcastId ??
        (
          await this.gateway.createBroadcast({
            name: campaign.name,
            ...rendered,
            ...(campaign.previewText
              ? { previewText: campaign.previewText }
              : {}),
            segmentId,
          })
        ).id;
      if (!campaign.providerBroadcastId)
        await this.prisma.emailCampaign.update({
          where: { id: campaign.id },
          data: { providerBroadcastId: broadcastId },
        });
      // Check again after provider preparation; fail closed if consent changed during it.
      const finalEmails = new Set(
        (await this.campaignRecipients(campaign)).map((row) => row.email),
      );
      if (sendable.some((row) => !finalEmails.has(row.email)))
        throw new EmailProviderError("AUDIENCE_CHANGED_DURING_PREPARATION");
      const claimed = await this.prisma.emailCampaign.updateMany({
        where: {
          id: campaign.id,
          status: "PREPARING",
          version: campaign.version,
        },
        data: {
          status: "DISPATCHING",
          recipientCount: sendable.length,
          providerBroadcastId: broadcastId,
          providerSegmentId: segmentId,
        },
      });
      if (!claimed.count) return;
      dispatchClaimed = true;
      await this.gateway.sendBroadcast(broadcastId);
      providerAcceptedDispatch = true;
      await this.prisma.emailCampaign.update({
        where: { id: campaign.id },
        data: { status: "SENT", sentAt: new Date(), lastErrorCode: null },
      });
    } catch (error) {
      if (error instanceof Error && error.message === "CONTACT_IMPORT_PENDING")
        throw error;
      const ambiguous =
        providerAcceptedDispatch ||
        (dispatchClaimed &&
          (!(error instanceof EmailProviderError) || error.ambiguous));
      await this.prisma.emailCampaign.updateMany({
        where: {
          id: campaign.id,
          status: dispatchClaimed ? "DISPATCHING" : "PREPARING",
        },
        data: {
          status: ambiguous ? "NEEDS_REVIEW" : "FAILED",
          lastErrorCode:
            error instanceof EmailProviderError
              ? error.code
              : "CAMPAIGN_PREPARATION_FAILED",
        },
      });
    }
  }

  async updateContactSubscription(
    userId: string,
    subscribed: boolean,
    preferenceUpdatedAt: string | null,
  ) {
    if (!preferenceUpdatedAt) return;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
        marketingPreference: true,
      },
    });
    if (!user) return;
    if (
      user.marketingPreference?.updatedAt.toISOString() !== preferenceUpdatedAt
    ) {
      return;
    }
    const currentlyEligible =
      user.role === "USER" &&
      user.status === "ACTIVE" &&
      Boolean(user.emailVerifiedAt) &&
      hasExplicitMarketingConsent(user.marketingPreference);
    if (currentlyEligible !== subscribed) return;
    await this.gateway.updateContactSubscription(user.email, currentlyEligible);
  }
}
