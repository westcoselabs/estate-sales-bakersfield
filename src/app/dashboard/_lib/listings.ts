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

export async function loadDashboardListings(
  user: AuthPrincipal,
): Promise<readonly DashboardListing[]> {
  const events = await createConfiguredEventService().list(user);
  const payments = await Promise.all(
    events.map((event) =>
      createConfiguredPaymentService().status(user, event.id),
    ),
  );
  return events.map((event, index) => ({
    event,
    payment: payments[index]!,
  }));
}
