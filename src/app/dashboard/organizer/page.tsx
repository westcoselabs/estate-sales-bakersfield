import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/modules/auth";
import { createConfiguredOrganizerService } from "@/modules/organizers";
import { DashboardShell } from "@/components/shells/shells";

import { OrganizerForm } from "../../_components/auth-forms";

export const dynamic = "force-dynamic";

export default async function OrganizerPage() {
  const user = await getCurrentUser();
  if (!user || user.status === "DISABLED") {
    redirect("/login?next=/dashboard/organizer");
  }
  if (user.status === "RESTRICTED") {
    redirect("/dashboard");
  }
  const organizer = await createConfiguredOrganizerService().getForUser(
    user.id,
  );

  return (
    <DashboardShell active="organizer">
      <div className="dashboard-content">
        <section>
          <p>
            <Link href="/dashboard">Account</Link>
          </p>
          <h1>Organizer profile</h1>
          <p>
            Save partial information and return later. Name, contact name, and
            contact email complete onboarding.
          </p>
          <p>Current status: {organizer?.status ?? "INCOMPLETE"}</p>
          <OrganizerForm initial={organizer} />
        </section>
      </div>
    </DashboardShell>
  );
}
