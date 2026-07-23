import { describe, expect, it } from "vitest";

import {
  listingMatches,
  listingPrimaryAction,
} from "@/app/dashboard/_components/listing-views";
import type { DashboardListing } from "@/app/dashboard/_lib/listings";
import type { PaymentDisplayState } from "@/modules/payments";

function listing(displayState: PaymentDisplayState): DashboardListing {
  return {
    event: {
      id: "11111111-1111-4111-8111-111111111111",
      title: "Test sale",
      eventType: "ESTATE_SALE",
      workflowState: "INCOMPLETE_DRAFT",
      approvalStatus: "NOT_APPROVED",
      startsAt: null,
      endsAt: null,
      timezone: null,
      readyPhotoCount: 0,
      hasReadyCover: false,
      approvalReady: false,
      version: 1,
      updatedAt: "2026-07-23T12:00:00.000Z",
    },
    payment: {
      eventId: "11111111-1111-4111-8111-111111111111",
      displayState,
      message: "Current status",
      price: null,
      attemptId: null,
      checkoutSessionId: null,
      paymentState: null,
      fulfillmentState: null,
      canonicalPath:
        displayState === "PUBLISHED" ? "/estate-sales/test-sale" : null,
      publishedAt: null,
      recoverable: false,
      updatedAt: "2026-07-23T12:00:00.000Z",
    },
  };
}

describe("dashboard listing views", () => {
  it("maps real status groups without treating transitional payment states as ready", () => {
    expect(listingMatches(listing("DRAFT_INCOMPLETE"), "drafts")).toBe(true);
    expect(listingMatches(listing("READY_FOR_REVIEW"), "ready")).toBe(true);
    expect(listingMatches(listing("READY_FOR_PAYMENT"), "ready")).toBe(true);
    expect(listingMatches(listing("PAYMENT_PENDING"), "ready")).toBe(false);
    expect(
      listingMatches(listing("PAYMENT_RECEIVED_PUBLISHING"), "attention"),
    ).toBe(false);
    expect(listingMatches(listing("CHECKOUT_EXPIRED"), "attention")).toBe(true);
    expect(listingMatches(listing("MANUAL_REVIEW_REQUIRED"), "attention")).toBe(
      true,
    );
    expect(listingMatches(listing("PUBLISHED"), "published")).toBe(true);
  });

  it("uses recovery, review, edit, and live-listing destinations", () => {
    expect(listingPrimaryAction(listing("DRAFT_INCOMPLETE")).label).toBe(
      "Continue editing",
    );
    expect(listingPrimaryAction(listing("CHECKOUT_EXPIRED")).label).toBe(
      "Continue payment",
    );
    expect(listingPrimaryAction(listing("MANUAL_REVIEW_REQUIRED")).label).toBe(
      "Review status",
    );
    expect(listingPrimaryAction(listing("PUBLISHED"))).toEqual({
      href: "/estate-sales/test-sale",
      label: "View live listing",
    });
  });
});
