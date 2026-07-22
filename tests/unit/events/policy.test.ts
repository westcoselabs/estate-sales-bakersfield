import { describe, expect, it } from "vitest";

import { approvalDigest } from "@/modules/events/application/approval";
import {
  draftWorkflowState,
  eventReadiness,
  eventStepReadiness,
  futurePublicEventProjection,
  publicEventProjection,
  toEventEditorDto,
} from "@/modules/events/application/policy";

import { readyEvent } from "./fixtures";

describe("event publication policy", () => {
  it("requires a verified location, ready photo, and event-owned ready cover", () => {
    const event = readyEvent({ coverPhotoId: null });
    expect(eventReadiness(event)).toMatchObject({ ready: false });
    expect(draftWorkflowState(event)).toBe("INCOMPLETE_DRAFT");
    expect(
      eventReadiness(
        readyEvent({
          location: {
            ...readyEvent().location!,
            validationStatus: "LOW_CONFIDENCE",
          },
        }),
      ).missing,
    ).toContain("Validate the event address.");
  });

  it("exposes structured server-owned wizard readiness", () => {
    expect(eventStepReadiness(readyEvent())).toEqual({
      detailsComplete: true,
      scheduleComplete: true,
      locationComplete: true,
      photosComplete: true,
      reviewReady: true,
    });
    expect(
      eventStepReadiness(readyEvent({ title: null, coverPhotoId: null })),
    ).toMatchObject({
      detailsComplete: false,
      photosComplete: false,
      reviewReady: false,
    });
  });

  it("never includes exact address or coordinates in an approximate projection", () => {
    const projection = publicEventProjection(
      readyEvent({ privacyMode: "APPROXIMATE_LOCATION" }),
      new Date("2026-07-20T00:00:00.000Z"),
    );
    expect(projection.address).toEqual({
      kind: "APPROXIMATE",
      city: "Bakersfield",
      region: "CA",
      countryCode: "US",
      label: "Near Bakersfield, CA",
    });
    expect(JSON.stringify(projection.address)).not.toContain("123 Main");
    expect(JSON.stringify(projection.address)).not.toContain("35.373292");
  });

  it("uses authoritative server time to release a hidden address", () => {
    const event = readyEvent({ privacyMode: "HIDDEN_UNTIL_START" });
    expect(
      publicEventProjection(event, new Date("2026-07-25T15:59:59.999Z")).address
        .kind,
    ).toBe("HIDDEN");
    expect(
      publicEventProjection(event, new Date("2026-07-25T16:00:00.000Z")).address
        .kind,
    ).toBe("EXACT");
  });

  it("uses the same projection for future listing approval and stable media URLs", () => {
    const event = readyEvent({ privacyMode: "HIDDEN_UNTIL_START" });
    const projection = futurePublicEventProjection(event);
    expect(projection.address.kind).toBe("EXACT");
    expect(projection.path).toBe(
      "/estate-sales/summer-estate-sale-abc123def456",
    );
    expect(toEventEditorDto(event).photos[0]?.urls.cover).toBe(
      "/media/photo-1/cover",
    );
  });

  it("drops an unsafe legacy organizer website from the public projection", () => {
    const event = readyEvent({ organizerWebsiteUrl: "javascript:alert(1)" });
    expect(futurePublicEventProjection(event).organizer.websiteUrl).toBeNull();
  });

  it("produces a deterministic digest and changes it for material public content", () => {
    const event = readyEvent();
    const projection = futurePublicEventProjection(event);
    const digest = approvalDigest(event, projection);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(approvalDigest(event, projection)).toBe(digest);
    const changed = readyEvent({ title: "Changed title", contentRevision: 7 });
    expect(
      approvalDigest(changed, futurePublicEventProjection(changed)),
    ).not.toBe(digest);
    const organizerChanged = readyEvent({
      organizerDisplayName: "Updated organizer",
      contentRevision: 7,
    });
    expect(
      approvalDigest(
        organizerChanged,
        futurePublicEventProjection(organizerChanged),
      ),
    ).not.toBe(digest);
  });
});
