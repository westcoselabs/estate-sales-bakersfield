import { z } from "zod";

export const checkoutRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
});

export const cancelPaymentRequestSchema = z.object({
  attemptId: z.uuid(),
});
