import "server-only";

import type { AuthPrincipal } from "@/modules/auth";
import {
  createConfiguredEventService,
  type EventListItemDto,
} from "@/modules/events";
import {
  createConfiguredPaymentService,
  type PaymentStatusDto,
} from "@/modules/payments";

export interface DashboardListing {
  readonly event: EventListItemDto;
  readonly payment: PaymentStatusDto;
}

export function nextListingEnd(
  listings: readonly DashboardListing[],
): string | null {
  return (
    listings
      .filter((listing) => listing.payment.displayState === "PUBLISHED")
      .map((listing) => listing.event.endsAt)
      .filter((endsAt): endsAt is string => endsAt !== null)
      .sort()[0] ?? null
  );
}

export async function loadDashboardListings(
  user: AuthPrincipal,
): Promise<readonly DashboardListing[]> {
  const events = await createConfiguredEventService().list(user);
  const payments = await createConfiguredPaymentService().statuses(
    user,
    events,
  );
  return events.map((event, index) => ({
    event,
    payment: payments[index]!,
  }));
}
