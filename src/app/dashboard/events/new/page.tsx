import { redirect } from "next/navigation";

import { CreateEventForm } from "@/app/_components/event-builder";
import { DashboardShell } from "@/components/shells/shells";
import { Icon } from "@/components/ui/icons";
import { getCurrentUser } from "@/modules/auth";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  const user = await getCurrentUser();
  if (!user || user.status === "DISABLED")
    redirect("/login?next=/dashboard/events/new");
  if (user.status === "RESTRICTED") redirect("/dashboard");
  return (
    <DashboardShell active="create" account={{ displayName: user.displayName }}>
      <div className="dashboard-content dashboard-create-page">
        <section className="dashboard-state-panel">
          <span className="dashboard-state-panel__icon">
            <Icon name="plus" />
          </span>
          <p className="eyebrow">New event</p>
          <h1>Create an event</h1>
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
