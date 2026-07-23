import { redirect } from "next/navigation";

import { CreateEventForm } from "@/app/_components/event-builder";
import { DashboardShell } from "@/components/shells/shells";
import { Icon } from "@/components/ui/icons";
import { getCurrentUser } from "@/modules/auth";
import { createConfiguredOrganizerService } from "@/modules/organizers";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  const user = await getCurrentUser();
  if (!user || user.status === "DISABLED")
    redirect("/login?next=/dashboard/events/new");
  if (user.status === "RESTRICTED") redirect("/dashboard");
  const organizer = await createConfiguredOrganizerService().getForUser(
    user.id,
  );
  if (organizer?.status !== "COMPLETE") redirect("/dashboard/profile");
  return (
    <DashboardShell active="create" account={{ displayName: user.displayName }}>
      <div className="dashboard-content dashboard-create-page">
        <section className="dashboard-state-panel">
          <span className="dashboard-state-panel__icon">
            <Icon name="plus" />
          </span>
          <p className="eyebrow">Create listing</p>
          <h1>Start your sale</h1>
          <p>
            Create a private draft first. Nothing is public until approval,
            payment, and publication are confirmed.
          </p>
          <CreateEventForm />
        </section>
      </div>
    </DashboardShell>
  );
}
