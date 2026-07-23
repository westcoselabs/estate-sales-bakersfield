import Link from "next/link";
import { redirect } from "next/navigation";

import { EmailRequestForm, LogoutButton } from "@/app/_components/auth-forms";
import { CreateEventForm } from "@/app/_components/event-builder";
import { DashboardShell } from "@/components/shells/shells";
import { Icon } from "@/components/ui/icons";
import { getCurrentUser } from "@/modules/auth";
import { createConfiguredOrganizerService } from "@/modules/organizers";

import { ListingCollection } from "./_components/listing-views";
import { loadDashboardListings } from "./_lib/listings";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ verified?: string }>;
}) {
  const query = await searchParams;
  const user = await getCurrentUser();
  if (!user || user.status === "DISABLED") redirect("/login?next=/dashboard");
  const account = { displayName: user.displayName };
  if (user.status === "RESTRICTED") {
    return (
      <DashboardShell account={account}>
        <section className="dashboard-state-panel">
          <span className="dashboard-state-panel__icon">
            <Icon name="warning" />
          </span>
          <p className="eyebrow">Account status</p>
          <h1>Account restricted</h1>
          <p>
            This account cannot access organizer tools. Contact support for
            help.
          </p>
          <LogoutButton />
        </section>
      </DashboardShell>
    );
  }
  const organizer = await createConfiguredOrganizerService().getForUser(
    user.id,
  );
  const listings =
    organizer?.status === "COMPLETE" ? await loadDashboardListings(user) : [];
  const attentionCount = listings.filter((item) =>
    [
      "PAYMENT_CANCELED",
      "CHECKOUT_EXPIRED",
      "PAID_PUBLICATION_BLOCKED",
      "FULFILLMENT_RETRYING",
      "MANUAL_REVIEW_REQUIRED",
    ].includes(item.payment.displayState),
  ).length;

  return (
    <DashboardShell account={account}>
      <div className="dashboard-content dashboard-overview">
        <header className="dashboard-page-header">
          <div>
            <p className="eyebrow">Organizer workspace</p>
            <h1>Welcome, {user.displayName}</h1>
            <p>Manage each sale from first draft through publication.</p>
          </div>
          <dl className="dashboard-summary-chips" aria-label="Listing summary">
            <div>
              <dt>Listings</dt>
              <dd>{listings.length}</dd>
            </div>
            <div>
              <dt>Need attention</dt>
              <dd>{attentionCount}</dd>
            </div>
          </dl>
        </header>

        {query.verified === "1" ? (
          <div className="success-box" role="status">
            Email verified. Publishing tools are now available when a listing is
            ready.
          </div>
        ) : null}

        {!user.emailVerifiedAt ? (
          <section
            className="dashboard-priority dashboard-priority--warning"
            aria-labelledby="verify-title"
          >
            <span className="dashboard-priority__icon">
              <Icon name="shield" />
            </span>
            <div>
              <p className="eyebrow">Your next step</p>
              <h2 id="verify-title">Verify your email</h2>
              <p>
                Draft now, then verify before photos, approval, payment, or
                publication.
              </p>
            </div>
            <EmailRequestForm
              endpoint="/api/auth/resend-verification"
              buttonLabel="Resend verification"
              initialEmail={user.email}
              hideEmailInput
            />
          </section>
        ) : organizer?.status !== "COMPLETE" ? (
          <section
            className="dashboard-priority"
            aria-labelledby="profile-title"
          >
            <span className="dashboard-priority__icon">
              <Icon name="user" />
            </span>
            <div>
              <p className="eyebrow">Your next step</p>
              <h2 id="profile-title">Complete your organizer profile</h2>
              <p>Add the contact details required before creating a listing.</p>
            </div>
            <Link
              className="ui-button ui-button--primary"
              href="/dashboard/profile"
            >
              Continue onboarding <Icon name="arrow" size={18} />
            </Link>
          </section>
        ) : attentionCount > 0 ? (
          <section className="dashboard-priority dashboard-priority--error">
            <span className="dashboard-priority__icon">
              <Icon name="warning" />
            </span>
            <div>
              <p className="eyebrow">Needs attention</p>
              <h2>
                {attentionCount}{" "}
                {attentionCount === 1 ? "listing needs" : "listings need"} a
                decision
              </h2>
              <p>
                Review payment or publication recovery guidance before
                continuing.
              </p>
            </div>
            <Link
              className="ui-button ui-button--primary"
              href="/dashboard/events?view=attention"
            >
              Review listings <Icon name="arrow" size={18} />
            </Link>
          </section>
        ) : null}

        <p className="dashboard-onboarding-status">
          Organizer onboarding: {organizer?.status ?? "Not started"}.
        </p>

        {organizer?.status === "COMPLETE" ? (
          <>
            <section
              className="dashboard-create-strip"
              aria-labelledby="quick-create-title"
            >
              <div>
                <p className="eyebrow">New sale</p>
                <h2 id="quick-create-title">Start a fresh draft</h2>
                <p>
                  Choose the real sale type. You can add details on the next
                  screen.
                </p>
              </div>
              <CreateEventForm />
            </section>
            <section
              className="dashboard-recent"
              aria-labelledby="recent-title"
            >
              <div className="dashboard-section-heading">
                <div>
                  <p className="eyebrow">Latest updates</p>
                  <h2 id="recent-title">Recent listings</h2>
                </div>
                <Link href="/dashboard/events">View all</Link>
              </div>
              <ListingCollection listings={listings.slice(0, 3)} view="all" />
            </section>
          </>
        ) : null}
      </div>
    </DashboardShell>
  );
}
