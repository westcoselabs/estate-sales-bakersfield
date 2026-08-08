import { describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { isRetryableListingImportReviewTransactionError } from "@/modules/listing-imports/infrastructure/prisma-listing-import-review-repository";

function knownRequestError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError("fixture database error", {
    code,
    clientVersion: "7.8.0",
    ...(meta ? { meta } : {}),
  });
}

describe("listing import review transaction retries", () => {
  it("recognizes the Neon raw-query serialization conflict shape", () => {
    const error = knownRequestError("P2010", {
      driverAdapterError: {
        cause: {
          kind: "TransactionWriteConflict",
          originalCode: "40001",
        },
      },
    });

    expect(isRetryableListingImportReviewTransactionError(error)).toBe(true);
  });

  it("does not classify arbitrary raw-query failures as retryable", () => {
    const error = knownRequestError("P2010", {
      driverAdapterError: {
        cause: { kind: "DatabaseAccessDenied", originalCode: "28000" },
      },
    });

    expect(isRetryableListingImportReviewTransactionError(error)).toBe(false);
  });

  it("retains Prisma's native transaction conflict classification", () => {
    expect(
      isRetryableListingImportReviewTransactionError(
        knownRequestError("P2034"),
      ),
    ).toBe(true);
  });
});
