import "server-only";

import { createConfiguredPaymentService } from "@/modules/payments";

const LISTING = /^([a-z0-9-]+)-([0-9a-f]{12})$/;

export async function loadPublishedListing(
  eventType: "ESTATE_SALE" | "YARD_SALE",
  value: string,
) {
  const match = LISTING.exec(value);
  if (!match) return null;
  const publicId = match[2];
  if (!publicId) return null;
  return createConfiguredPaymentService().published(eventType, publicId);
}
