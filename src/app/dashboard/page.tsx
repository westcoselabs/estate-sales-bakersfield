import Link from "next/link";
import { redirect } from "next/navigation";

import { createConfiguredSessionService, getCurrentUser } from "@/modules/auth";

import {
  EmailRequestForm,
  LogoutButton,
  SessionManager,
} from "../_components/auth-forms";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user || user.status === "DISABLED") {
    redirect("/login?next=/dashboard");
  }
  if (user.status === "RESTRICTED") {
    return (
      <main>
        <section>
          <h1>Account restricted</h1>
          <p>
            This account cannot access organizer tools. Contact support for
            help.
          </p>
          <LogoutButton />
        </section>
      </main>
    );
  }
  const sessions = await createConfiguredSessionService().list(user.id);

  return (
    <main>
      <section>
        <p>Account</p>
        <h1>Welcome, {user.displayName}</h1>
        <p>
          Email status:{" "}
          {user.emailVerifiedAt ? "Verified" : "Verification required"}
        </p>
        {!user.emailVerifiedAt ? (
          <EmailRequestForm
            endpoint="/api/auth/resend-verification"
            buttonLabel="Resend verification"
          />
        ) : null}
        <p>
          <Link href="/dashboard/organizer">Continue organizer onboarding</Link>
        </p>
        <SessionManager
          initialSessions={sessions.map((session) => ({
            ...session,
            createdAt: session.createdAt.toISOString(),
            expiresAt: session.expiresAt.toISOString(),
          }))}
        />
        <LogoutButton />
      </section>
    </main>
  );
}
