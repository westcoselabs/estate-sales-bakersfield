import { describe, expect, it } from "vitest";

import {
  checkoutEligibility,
  fulfillmentEligibility,
} from "@/modules/payments/application/eligibility";
import {
  createPublicationSnapshot,
  publishedListing,
} from "@/modules/payments/application/publication";

import { approvedEvent, now, paymentAttempt } from "./fixtures";

describe("Phase 4 payment eligibility and publication projection", () => {
  it("accepts only the exact current approved revision and digest", () => {
    const event = approvedEvent();
    expect(checkoutEligibility(event, now)).toEqual({
      approvalId: event.currentApprovalId,
      approvedRevision: event.contentRevision,
      approvalDigest: event.approvalDigest,
    });
    expect(fulfillmentEligibility(event, paymentAttempt(event), now)).toEqual({
      eligible: true,
    });
  });

  it("rejects stale approvals, incomplete photos, and invalid schedules", () => {
    expect(() =>
      checkoutEligibility(approvedEvent({ contentRevision: 7 }), now),
    ).toThrowError(expect.objectContaining({ code: "STALE_APPROVAL" }));
    expect(() =>
      checkoutEligibility({ ...approvedEvent(), coverPhotoId: null }, now),
    ).toThrowError(expect.objectContaining({ code: "INCOMPLETE_PHOTOS" }));
    expect(() =>
      checkoutEligibility(
        {
          ...approvedEvent(),
          startsAt: new Date("2026-07-20T16:00:00.000Z"),
        },
        now,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_SCHEDULE" }));
  });

  it("blocks a paid stale attempt instead of publishing a changed event", () => {
    const approved = approvedEvent();
    const attempt = paymentAttempt(approved);
    const changed = approvedEvent({
      contentRevision: approved.contentRevision + 1,
      approvedRevision: null,
      approvalStatus: "NOT_APPROVED",
      workflowState: "PREVIEW_READY",
      currentApprovalId: null,
    });
    expect(fulfillmentEligibility(changed, attempt, now)).toEqual({
      eligible: false,
      reason: "STALE_APPROVED_REVISION",
    });
  });

  it("keeps a hidden-until-start street address out of every runtime public projection", () => {
    const event = approvedEvent({ privacyMode: "HIDDEN_UNTIL_START" });
    const snapshot = createPublicationSnapshot(event);
    const beforeStart = publishedListing({
      eventId: event.id,
      approvedRevision: event.approvedRevision!,
      canonicalPath: snapshot.projection.path,
      publishedAt: now,
      snapshot,
      now,
    });
    expect(beforeStart.projection.address).toMatchObject({
      kind: "HIDDEN",
      city: "Bakersfield",
    });
    expect(beforeStart.verifiedEmail).toBe("seller@example.test");
    expect(JSON.stringify(beforeStart)).not.toContain("123 Main Street");

    const afterStart = publishedListing({
      eventId: event.id,
      approvedRevision: event.approvedRevision!,
      canonicalPath: snapshot.projection.path,
      publishedAt: now,
      snapshot,
      now: new Date("2026-08-25T16:00:01.000Z"),
    });
    expect(afterStart.projection.address).toMatchObject({
      kind: "EXACT",
      addressLine1: "123 Main Street",
    });
  });
});
