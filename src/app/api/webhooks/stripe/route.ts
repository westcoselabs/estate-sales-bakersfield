import {
  createConfiguredPaymentService,
  PaymentError,
} from "@/modules/payments";
import { requestIdFrom } from "@/platform/http/request-context";
import { logger } from "@/platform/observability/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const MAXIMUM_WEBHOOK_BYTES = 128 * 1024;

export async function POST(request: Request): Promise<Response> {
  const requestId = requestIdFrom(request);
  const signature = request.headers.get("stripe-signature");
  const length = Number(request.headers.get("content-length") ?? "0");
  if (!signature || length > MAXIMUM_WEBHOOK_BYTES) {
    return Response.json(
      { error: "Invalid webhook request", requestId },
      {
        status: 400,
        headers: { "cache-control": "no-store", "x-request-id": requestId },
      },
    );
  }
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAXIMUM_WEBHOOK_BYTES) {
    return Response.json(
      { error: "Invalid webhook request", requestId },
      {
        status: 400,
        headers: { "cache-control": "no-store", "x-request-id": requestId },
      },
    );
  }
  try {
    const result = await createConfiguredPaymentService().handleWebhook(
      rawBody,
      signature,
    );
    return Response.json(
      { received: true, duplicate: result.duplicate, requestId },
      { headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
  } catch (error) {
    const invalid =
      error instanceof PaymentError &&
      error.code === "WEBHOOK_SIGNATURE_INVALID";
    if (!invalid) {
      logger.error(
        {
          requestId,
          operation: "payments.stripe-webhook",
          errorType: error instanceof Error ? error.name : "UnknownError",
          errorCode: error instanceof PaymentError ? error.code : "UNEXPECTED",
        },
        "Stripe webhook processing failed",
      );
    }
    return Response.json(
      {
        error: invalid
          ? "Invalid webhook signature"
          : "Webhook processing failed",
        requestId,
      },
      {
        status: invalid ? 400 : 500,
        headers: { "cache-control": "no-store", "x-request-id": requestId },
      },
    );
  }
}
