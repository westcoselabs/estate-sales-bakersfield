import { Resend } from "resend";
import { getPrismaClient } from "@/platform/database/client";
import { getServerEnvironment } from "@/platform/config/env";
import {
  BoundedBodyError,
  readBoundedText,
} from "@/platform/http/bounded-body";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAXIMUM_WEBHOOK_BYTES = 128 * 1024;

export async function POST(request: Request) {
  const environment = getServerEnvironment();
  if (!environment.RESEND_API_KEY || !environment.RESEND_WEBHOOK_SECRET)
    return new Response("Unavailable", { status: 503 });
  let payload: string;
  try {
    payload = await readBoundedText(request, {
      maxBytes: MAXIMUM_WEBHOOK_BYTES,
    });
  } catch (error) {
    return new Response("Invalid webhook request", {
      status:
        error instanceof BoundedBodyError && error.code === "PAYLOAD_TOO_LARGE"
          ? 413
          : 400,
      headers: { "Cache-Control": "no-store" },
    });
  }
  let verified: unknown;
  try {
    verified = new Resend(environment.RESEND_API_KEY).webhooks.verify({
      payload,
      headers: {
        id: request.headers.get("svix-id") ?? "",
        timestamp: request.headers.get("svix-timestamp") ?? "",
        signature: request.headers.get("svix-signature") ?? "",
      },
      webhookSecret: environment.RESEND_WEBHOOK_SECRET,
    });
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  if (!verified || typeof verified !== "object") {
    return new Response("Invalid event", { status: 400 });
  }
  const event = verified as Record<string, unknown>;
  const eventId = request.headers.get("svix-id");
  if (!eventId) return new Response("Invalid event", { status: 400 });
  const type = String(event.type ?? "unknown").slice(0, 100);
  const data =
    event.data && typeof event.data === "object"
      ? (event.data as Record<string, unknown>)
      : {};
  const messageId =
    typeof data.email_id === "string"
      ? data.email_id
      : typeof data.id === "string" && type.startsWith("email.")
        ? data.id
        : null;
  const broadcastId =
    typeof data.broadcast_id === "string" ? data.broadcast_id : null;
  const contactId =
    typeof data.contact_id === "string"
      ? data.contact_id
      : typeof data.id === "string" && type === "contact.updated"
        ? data.id
        : null;
  const occurredAt = new Date(
    typeof event.created_at === "string" || typeof event.created_at === "number"
      ? event.created_at
      : Date.now(),
  );
  const prisma = getPrismaClient();
  try {
    await prisma.$transaction(async (tx) => {
      const inserted = await tx.resendWebhookEvent.createMany({
        data: [
          {
            id: eventId,
            eventType: type,
            providerMessageId: messageId,
            providerBroadcastId: broadcastId,
            providerContactId: contactId,
            occurredAt,
          },
        ],
        skipDuplicates: true,
      });
      if (!inserted.count) return;
      const statusMap: Record<
        string,
        {
          status:
            "DELIVERED" | "FAILED" | "BOUNCED" | "COMPLAINED" | "SUPPRESSED";
          field:
            | "deliveredAt"
            | "failedAt"
            | "bouncedAt"
            | "complainedAt"
            | "suppressedAt";
        }
      > = {
        "email.delivered": { status: "DELIVERED", field: "deliveredAt" },
        "email.delivery_delayed": { status: "FAILED", field: "failedAt" },
        "email.failed": { status: "FAILED", field: "failedAt" },
        "email.bounced": { status: "BOUNCED", field: "bouncedAt" },
        "email.complained": { status: "COMPLAINED", field: "complainedAt" },
        "email.suppressed": { status: "SUPPRESSED", field: "suppressedAt" },
      };
      const deliveryStatus = statusMap[type];
      if (messageId && deliveryStatus) {
        const allowedCurrentStatuses = {
          DELIVERED: ["PENDING", "SENT", "FAILED", "DELIVERED"],
          FAILED: ["PENDING", "SENT", "FAILED"],
          BOUNCED: ["PENDING", "SENT", "DELIVERED", "FAILED", "BOUNCED"],
          COMPLAINED: [
            "PENDING",
            "SENT",
            "DELIVERED",
            "FAILED",
            "BOUNCED",
            "COMPLAINED",
            "SUPPRESSED",
          ],
          SUPPRESSED: [
            "PENDING",
            "SENT",
            "DELIVERED",
            "FAILED",
            "BOUNCED",
            "SUPPRESSED",
          ],
        }[deliveryStatus.status] as Array<
          | "PENDING"
          | "SENT"
          | "DELIVERED"
          | "FAILED"
          | "BOUNCED"
          | "COMPLAINED"
          | "SUPPRESSED"
        >;
        await tx.emailDelivery.updateMany({
          where: {
            providerMessageId: messageId,
            status: { in: allowedCurrentStatuses },
            OR: [
              { providerLastEventAt: null },
              { providerLastEventAt: { lte: occurredAt } },
            ],
          },
          data: {
            status: deliveryStatus.status,
            [deliveryStatus.field]: occurredAt,
            providerLastEventAt: occurredAt,
          },
        });
      }
      if (broadcastId) {
        const counter =
          type === "email.delivered"
            ? "deliveredCount"
            : type === "email.bounced"
              ? "bouncedCount"
              : type === "email.complained"
                ? "complainedCount"
                : type === "email.suppressed"
                  ? "suppressedCount"
                  : null;
        if (counter)
          await tx.emailCampaign.updateMany({
            where: { providerBroadcastId: broadcastId },
            data: { [counter]: { increment: 1 } },
          });
      }
      const email =
        typeof data.email === "string" ? data.email.trim().toLowerCase() : null;
      const shouldUnsubscribe =
        type === "email.complained" ||
        type === "email.bounced" ||
        type === "email.suppressed" ||
        (type === "contact.updated" && data.unsubscribed === true);
      if (email && shouldUnsubscribe) {
        const user = await tx.user.findUnique({
          where: { normalizedEmail: email },
          select: { id: true },
        });
        if (user)
          await tx.marketingPreference.upsert({
            where: { userId: user.id },
            create: {
              userId: user.id,
              unsubscribedAt: occurredAt,
            },
            update: { unsubscribedAt: occurredAt },
          });
      }
      await tx.resendWebhookEvent.update({
        where: { id: eventId },
        data: { processingState: "PROCESSED", processedAt: new Date() },
      });
    });
    return new Response(null, { status: 204 });
  } catch {
    await prisma.resendWebhookEvent.updateMany({
      where: { id: eventId },
      data: { processingState: "FAILED", failureReason: "PROCESSING_FAILED" },
    });
    return new Response("Retry", { status: 503 });
  }
}
