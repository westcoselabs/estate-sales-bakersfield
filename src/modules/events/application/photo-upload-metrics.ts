import { z } from "zod";

const count = z.number().int().min(0).max(150);
const milliseconds = z
  .number()
  .int()
  .min(0)
  .max(24 * 60 * 60 * 1000);
export const photoUploadMetricsSchema = z
  .object({
    batchId: z.uuid(),
    selected: count.min(1),
    ready: count,
    failed: count,
    pending: count,
    originalBytes: z
      .number()
      .int()
      .min(0)
      .max(150 * 15 * 1024 * 1024),
    preparedBytes: z
      .number()
      .int()
      .min(0)
      .max(150 * 2 * 1024 * 1024),
    reservationMs: milliseconds.optional(),
    transferMs: milliseconds.optional(),
    finishingMs: milliseconds.optional(),
    preparationMs: milliseconds,
    totalMs: milliseconds,
    softwareDecoded: count,
    transferRetries: z.number().int().min(0).max(450).optional(),
    reconciledTransfers: count.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.ready + value.failed + value.pending === value.selected &&
      value.softwareDecoded <= value.selected,
  );
