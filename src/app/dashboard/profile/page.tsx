import { redirect } from "next/navigation";
import Link from "next/link";

import { OrganizerForm } from "@/app/_components/auth-forms";
import { AccountAvatar } from "@/components/shells/account-menu";
import { DashboardShell } from "@/components/shells/shells";
import { getCurrentUser } from "@/modules/auth";
import { createConfiguredOrganizerService } from "@/modules/organizers";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  searchParams,
}: {
  readonly searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const { returnTo } = await searchParams;
  const returnHref =
    typeof returnTo === "string" &&
    /^\/dashboard\/events\/[0-9a-f-]{36}\/edit$/.test(returnTo)
      ? returnTo
      : undefined;
  const user = await getCurrentUser();
  if (!user || user.status === "DISABLED")
    redirect("/login?next=/dashboard/profile");
  if (user.status === "RESTRICTED") redirect("/dashboard");
  const organizer = await createConfiguredOrganizerService().getForUser(
    user.id,
  );
  const account = {
    displayName: user.displayName,
    isSuperAdmin: user.role === "SUPER_ADMIN",
  };
  return (
    <DashboardShell active="profile" account={account}>
      <div className="dashboard-content">
        <header className="dashboard-page-header">
          <div>
            <p className="eyebrow">Account</p>
            <h1>Profile</h1>
            <p>Complete your organizer identity before approving an event.</p>
            {returnHref ? (
              <Link className="button-link" href={returnHref}>
                Back to your event
              </Link>
            ) : null}
          </div>
        </header>
        <div className="profile-layout">
          <aside
            className="profile-card"
            aria-labelledby="profile-summary-title"
          >
            <AccountAvatar account={account} size="large" />
            <div>
              <h2 id="profile-summary-title">
                {organizer?.displayName ?? user.displayName}
              </h2>
              <p>Account email: {user.email}</p>
            </div>
          </aside>
          <section
            className="profile-form-panel"
            aria-labelledby="profile-form-title"
          >
            <div className="dashboard-section-heading">
              <div>
                <p className="eyebrow">Organizer profile</p>
                <h2 id="profile-form-title">Publishing details</h2>
              </div>
            </div>
            <p>
              Your organizer name appears publicly. Contact name and contact
              email are required for account operations and remain private.
              Phone and website are optional.
            </p>
            <OrganizerForm
              initial={organizer}
              {...(returnHref ? { returnHref } : {})}
            />
          </section>
        </div>
      </div>
    </DashboardShell>
  );
}
