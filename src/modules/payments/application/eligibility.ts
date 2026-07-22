import {
  approvalDigest,
  eventReadiness,
  futurePublicEventProjection,
  type EventRecord,
} from "@/modules/events";

import {
  AlreadyPublishedError,
  EventNotApprovedForPaymentError,
  IncompletePaymentPhotosError,
  InvalidPaymentScheduleError,
  StaleApprovalError,
} from "../domain/errors";

export interface CheckoutEligibility {
  readonly approvalId: string;
  readonly approvedRevision: number;
  readonly approvalDigest: string;
}

export function checkoutEligibility(
  event: EventRecord,
  now: Date,
): CheckoutEligibility {
  if (event.publication) throw new AlreadyPublishedError();
  if (event.origin !== "OWNER_CREATED") {
    throw new EventNotApprovedForPaymentError(
      "This event origin does not use owner publication payment.",
    );
  }
  if (
    event.workflowState !== "APPROVED_FOR_PAYMENT" ||
    event.approvalStatus !== "APPROVED" ||
    !event.currentApprovalId ||
    !event.approvedRevision ||
    !event.approvalDigest
  ) {
    throw new EventNotApprovedForPaymentError();
  }
  if (event.approvedRevision !== event.contentRevision) {
    throw new StaleApprovalError();
  }
  const readiness = eventReadiness(event);
  if (!readiness.ready) {
    if (readiness.missing.some((item) => /photo|cover/i.test(item))) {
      throw new IncompletePaymentPhotosError();
    }
    throw new EventNotApprovedForPaymentError(
      "The approved event no longer satisfies publication requirements.",
    );
  }
  if (
    !event.startsAt ||
    !event.endsAt ||
    event.startsAt.getTime() <= now.getTime() ||
    event.endsAt.getTime() <= event.startsAt.getTime()
  ) {
    throw new InvalidPaymentScheduleError();
  }
  const projection = futurePublicEventProjection(event);
  if (approvalDigest(event, projection) !== event.approvalDigest) {
    throw new StaleApprovalError(
      "The current event content does not match its approval digest.",
    );
  }
  return {
    approvalId: event.currentApprovalId,
    approvedRevision: event.approvedRevision,
    approvalDigest: event.approvalDigest,
  };
}

export function fulfillmentEligibility(
  event: EventRecord,
  attempt: {
    readonly id: string;
    readonly eventId: string;
    readonly organizerId: string;
    readonly userId: string;
    readonly approvalId: string;
    readonly approvedRevision: number;
    readonly approvedDigest: string;
  },
  now: Date,
): { readonly eligible: true } | { readonly eligible: false; reason: string } {
  if (event.publication) {
    return event.publication.paymentAttemptId === attempt.id
      ? { eligible: true }
      : { eligible: false, reason: "CONFLICTING_PUBLICATION" };
  }
  if (
    event.id !== attempt.eventId ||
    event.organizerId !== attempt.organizerId ||
    event.ownerUserId !== attempt.userId
  ) {
    return { eligible: false, reason: "OWNERSHIP_MISMATCH" };
  }
  if (
    event.approvalStatus !== "APPROVED" ||
    event.workflowState !== "APPROVED_FOR_PAYMENT" ||
    event.currentApprovalId !== attempt.approvalId ||
    event.contentRevision !== attempt.approvedRevision ||
    event.approvedRevision !== attempt.approvedRevision ||
    event.approvalDigest !== attempt.approvedDigest
  ) {
    return { eligible: false, reason: "STALE_APPROVED_REVISION" };
  }
  if (eventReadiness(event).ready === false) {
    return { eligible: false, reason: "PUBLICATION_REQUIREMENTS_CHANGED" };
  }
  if (
    !event.endsAt ||
    event.endsAt.getTime() <= now.getTime() ||
    !event.startsAt ||
    event.endsAt.getTime() <= event.startsAt.getTime()
  ) {
    return { eligible: false, reason: "INVALID_EVENT_SCHEDULE" };
  }
  try {
    const projection = futurePublicEventProjection(event);
    if (approvalDigest(event, projection) !== attempt.approvedDigest) {
      return { eligible: false, reason: "APPROVAL_DIGEST_MISMATCH" };
    }
  } catch {
    return { eligible: false, reason: "PUBLIC_PROJECTION_INVALID" };
  }
  return { eligible: true };
}
