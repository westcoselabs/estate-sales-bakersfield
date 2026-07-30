import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/shells/shells";
import { Icon } from "@/components/ui/icons";
import { getCurrentUser } from "@/modules/auth";

import {
  ListingCollection,
  ListingTabs,
  type ListingView,
} from "../_components/listing-views";
import { loadDashboardListings } from "../_lib/listings";

export const dynamic = "force-dynamic";

export default async function EventsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ view?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || user.status === "DISABLED")
    redirect("/login?next=/dashboard/events");
  if (user.status === "RESTRICTED") redirect("/dashboard");
  const query = await searchParams;
  const requested = query.view;
  const view: ListingView =
    requested &&
    ["drafts", "ready", "published", "attention"].includes(requested)
      ? (requested as ListingView)
      : "all";
  const listings = await loadDashboardListings(user);
  return (
    <DashboardShell
      active="listings"
      account={{ displayName: user.displayName }}
    >
      <div className="dashboard-content">
        <header className="dashboard-page-header">
          <div>
            <p className="eyebrow">Listing management</p>
            <h1>Your sales</h1>
            <p>
              One place for every draft, payment state, and published listing.
            </p>
          </div>
          <Link
            className="ui-button ui-button--primary"
            href="/dashboard/events/new"
          >
            <Icon name="plus" /> Create event
          </Link>
        </header>
        <ListingTabs current={view} listings={listings} />
        <ListingCollection listings={listings} view={view} />
      </div>
    </DashboardShell>
  );
}
