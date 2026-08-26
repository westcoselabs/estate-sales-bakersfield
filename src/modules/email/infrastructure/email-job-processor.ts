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

  async sendCampaign(campaignId: string) {
    if (
      this.environment.APP_ENV !== "production" ||
      !this.environment.EMAIL_CAMPAIGNS_ENABLED ||
      this.environment.RESEND_RESOURCE_ENV !== "production"
    ) {
      await this.prisma.emailCampaign.update({
        where: { id: campaignId },
        data: { status: "FAILED", lastErrorCode: "CAMPAIGNS_DISABLED" },
      });
      return;
    }
    const campaign = await this.prisma.emailCampaign.findUnique({
      where: { id: campaignId },
      include: {
        templateRevision: true,
        recipients: {
          include: {
            user: {
              select: {
                email: true,
                displayName: true,
                role: true,
                status: true,
                emailVerifiedAt: true,
                marketingPreference: {
                  select: {
                    consentAt: true,
                    consentVersion: true,
                    consentSource: true,
                    unsubscribedAt: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!campaign || campaign.status !== "PREPARING") return;
    const recipients = campaign.recipients.filter(
      ({ user }) =>
        user.role === "USER" &&
        user.status === "ACTIVE" &&
        user.emailVerifiedAt &&
        hasExplicitMarketingConsent(user.marketingPreference),
    );
    if (!recipients.length || recipients.length > 10_000) {
      await this.prisma.emailCampaign.update({
        where: { id: campaign.id },
        data: { status: "FAILED", lastErrorCode: "INVALID_FINAL_AUDIENCE" },
      });
      return;
    }
    const listings =
      campaign.listingSnapshot as unknown as CampaignListingSnapshot[];
    const rendered = renderEmailTemplate({
      subject: campaign.subject,
      html: campaign.templateRevision.html,
      values: {},
      trustedHtml: {
        RECENT_LISTINGS_HTML: renderRecentListingsHtml(
          listings,
          this.environment.APP_URL,
        ),
        RESEND_UNSUBSCRIBE_URL: "{{{RESEND_UNSUBSCRIBE_URL}}}",
      },
      text: `Recent estate sales: ${listings.map((listing) => listing.title).join(", ")}. Unsubscribe using the link in this email.`,
    });
    let providerAcceptedDispatch = false;
    try {
      const segmentId =
        campaign.providerSegmentId ??
        (await this.gateway.createSegment(`Campaign ${campaign.id}`)).id;
      if (!campaign.providerSegmentId) {
        await this.prisma.emailCampaign.update({
          where: { id: campaign.id },
          data: { providerSegmentId: segmentId },
        });
      }
      const contactImportId =
        campaign.providerContactImportId ??
        (
          await this.gateway.importContacts({
            segmentId,
            rows: recipients.map(({ user }) => ({
              email: user.email,
              firstName: user.displayName,
            })),
          })
        ).id;
      if (!campaign.providerContactImportId) {
        await this.prisma.emailCampaign.update({
          where: { id: campaign.id },
          data: { providerContactImportId: contactImportId },
        });
        throw new Error("CONTACT_IMPORT_PENDING");
      }
      const importStatus =
        await this.gateway.getContactImportStatus(contactImportId);
      if (importStatus === "failed")
        throw new EmailProviderError("CONTACT_IMPORT_FAILED", false);
      if (importStatus !== "completed")
        throw new Error("CONTACT_IMPORT_PENDING");
      const broadcastId =
        campaign.providerBroadcastId ??
        (
          await this.gateway.createBroadcast({
            name: campaign.name,
            subject: rendered.subject,
            ...(campaign.previewText
              ? { previewText: campaign.previewText }
              : {}),
            html: rendered.html,
            text: rendered.text,
            segmentId,
          })
        ).id;
      if (!campaign.providerBroadcastId)
        await this.prisma.emailCampaign.update({
          where: { id: campaign.id },
          data: { providerBroadcastId: broadcastId },
        });
      await this.prisma.emailCampaign.update({
        where: { id: campaign.id },
        data: {
          status: "READY",
          providerSegmentId: segmentId,
          providerContactImportId: contactImportId,
          providerBroadcastId: broadcastId,
          recipientCount: recipients.length,
        },
      });
      await this.prisma.emailCampaign.update({
        where: { id: campaign.id },
        data: { status: "DISPATCHING" },
      });
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
        (error instanceof EmailProviderError && error.ambiguous);
      await this.prisma.emailCampaign.update({
        where: { id: campaign.id },
        data: {
          status: ambiguous ? "NEEDS_REVIEW" : "FAILED",
          lastErrorCode:
            error instanceof Error
              ? error.name.slice(0, 100)
              : "CAMPAIGN_PROVIDER_FAILURE",
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
