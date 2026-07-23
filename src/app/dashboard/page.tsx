import Link from "next/link";
import { redirect } from "next/navigation";

import { createConfiguredSessionService, getCurrentUser } from "@/modules/auth";
import { createConfiguredEventService } from "@/modules/events";
import { createConfiguredOrganizerService } from "@/modules/organizers";
import { createConfiguredPaymentService } from "@/modules/payments";
import { DashboardShell } from "@/components/shells/shells";

import {
  EmailRequestForm,
  LogoutButton,
  SessionManager,
} from "../_components/auth-forms";
import { CreateEventForm } from "../_components/event-builder";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ verified?: string }>;
}) {
  const query = await searchParams;
  const user = await getCurrentUser();
  if (!user || user.status === "DISABLED") {
    redirect("/login?next=/dashboard");
  }
  if (user.status === "RESTRICTED") {
    return (
      <DashboardShell>
        <section>
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
  const sessions = await createConfiguredSessionService().list(user.id);
  const organizer = await createConfiguredOrganizerService().getForUser(
    user.id,
  );
  const events =
    organizer?.status === "COMPLETE"
      ? await createConfiguredEventService().list(user)
      : [];
  const paymentStatuses = new Map(
    await Promise.all(
      events.map(
        async (event) =>
          [
            event.id,
            await createConfiguredPaymentService().status(user, event.id),
          ] as const,
      ),
    ),
  );

  return (
    <DashboardShell>
      <div className="dashboard-content">
        <section className="dashboard-panel">
          {query.verified === "1" ? (
            <div className="success-box" role="status">
              Email verified. Your publishing tools are now available when the
              event is ready.
            </div>
          ) : null}
          <p>Account</p>
          <h1>Welcome, {user.displayName}</h1>
          <p>
            Email status:{" "}
            {user.emailVerifiedAt ? "Verified" : "Verification required"}
          </p>
          {!user.emailVerifiedAt ? (
            <aside
              className="verification-banner"
              aria-labelledby="verify-title"
            >
              <h2 id="verify-title">Email verification required</h2>
              <p>Status: Not verified</p>
              <p>
                Verify your email before uploading photos, approving, paying, or
                publishing.
              </p>
              <EmailRequestForm
                endpoint="/api/auth/resend-verification"
                buttonLabel="Resend verification"
                initialEmail={user.email}
                hideEmailInput
              />
            </aside>
          ) : null}
          <p>
            Organizer onboarding: {organizer?.status ?? "Not started"}.{" "}
            <Link href="/dashboard/organizer">
              {organizer?.status === "COMPLETE"
                ? "Review organizer profile"
                : "Continue onboarding"}
            </Link>
          </p>
          {organizer?.status === "COMPLETE" ? (
            <>
              <div className="dashboard-heading">
                <div>
                  <p className="eyebrow">Organizer workspace</p>
                  <h2>Your event drafts</h2>
                </div>
                <CreateEventForm />
              </div>
              {events.length ? (
                <div className="event-grid">
                  {events.map((event) => (
                    <article className="event-card" key={event.id}>
                      <p className="eyebrow">
                        {event.eventType === "ESTATE_SALE"
                          ? "Estate sale"
                          : "Yard sale"}
                      </p>
                      <h3>{event.title ?? "Untitled event"}</h3>
                      <p>State: {event.workflowState.replaceAll("_", " ")}</p>
                      <p>
                        Schedule:{" "}
                        {event.startsAt
                          ? new Date(event.startsAt).toLocaleString()
                          : "Not set"}
                      </p>
                      <p>
                        Photos: {event.readyPhotoCount} ready; cover{" "}
                        {event.hasReadyCover ? "ready" : "needed"}
                      </p>
                      <p>
                        Approval readiness:{" "}
                        {event.approvalReady ? "Ready" : "Incomplete"}
                      </p>
                      <p>
                        Payment/publication:{" "}
                        {paymentStatuses
                          .get(event.id)
                          ?.displayState.replaceAll("_", " ")}
                      </p>
                      <p>
                        Updated {new Date(event.updatedAt).toLocaleString()}
                      </p>
                      <p>
                        <Link href={`/dashboard/events/${event.id}/edit`}>
                          Continue editing
                        </Link>
                        {" · "}
                        <Link href={`/dashboard/events/${event.id}/preview`}>
                          Preview
                        </Link>
                        {" · "}
                        <Link href={`/dashboard/events/${event.id}/payment`}>
                          {paymentStatuses.get(event.id)?.displayState ===
                          "READY_FOR_PAYMENT"
                            ? "Make payment"
                            : paymentStatuses.get(event.id)?.displayState ===
                                  "CHECKOUT_CREATED" ||
                                paymentStatuses.get(event.id)?.displayState ===
                                  "PAYMENT_CANCELED" ||
                                paymentStatuses.get(event.id)?.displayState ===
                                  "CHECKOUT_EXPIRED"
                              ? "Continue payment"
                              : "Payment status"}
                        </Link>
                        {paymentStatuses.get(event.id)?.canonicalPath ? (
                          <>
                            {" · "}
                            <Link
                              href={
                                paymentStatuses.get(event.id)!.canonicalPath!
                              }
                            >
                              Live listing
                            </Link>
                          </>
                        ) : null}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <p>No event drafts yet.</p>
              )}
            </>
          ) : null}
          <SessionManager
            initialSessions={sessions.map((session) => ({
              ...session,
              createdAt: session.createdAt.toISOString(),
              expiresAt: session.expiresAt.toISOString(),
            }))}
          />
          <LogoutButton />
        </section>
      </div>
    </DashboardShell>
  );
}
