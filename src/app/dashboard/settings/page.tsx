import { redirect } from "next/navigation";
import Link from "next/link";

import {
  EmailRequestForm,
  LogoutButton,
  SessionManager,
} from "@/app/_components/auth-forms";
import { DashboardShell } from "@/components/shells/shells";
import { Icon } from "@/components/ui/icons";
import { createConfiguredSessionService, getCurrentUser } from "@/modules/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user || user.status === "DISABLED")
    redirect("/login?next=/dashboard/settings");
  if (user.status === "RESTRICTED") redirect("/dashboard");
  const sessions = await createConfiguredSessionService().list(user.id);
  const account = { displayName: user.displayName };
  return (
    <DashboardShell active="settings" account={account}>
      <div className="dashboard-content">
        <header className="dashboard-page-header">
          <div>
            <p className="eyebrow">Account</p>
            <h1>Settings and security</h1>
            <p>Review verification, active sessions, and account access.</p>
          </div>
        </header>
        <div className="settings-grid">
          <section
            className="settings-panel"
            aria-labelledby="email-security-title"
          >
            <span className="settings-panel__icon">
              <Icon name="shield" />
            </span>
            <div>
              <p className="eyebrow">Email security</p>
              <h2 id="email-security-title">
                {user.emailVerifiedAt
                  ? "Email verified"
                  : "Verification required"}
              </h2>
              <p>{user.email}</p>
              {!user.emailVerifiedAt ? (
                <>
                  <p>
                    You can keep building your event and adding photos. Verify
                    before approval and payment.
                  </p>
                  <EmailRequestForm
                    endpoint="/api/auth/resend-verification"
                    buttonLabel="Send verification email"
                    initialEmail={user.email}
                    hideEmailInput
                  />
                </>
              ) : (
                <p className="success-box" role="status">
                  Your email is verified.
                </p>
              )}
            </div>
          </section>
          <div className="settings-sessions">
            <SessionManager
              initialSessions={sessions.map((session) => ({
                ...session,
                createdAt: session.createdAt.toISOString(),
                expiresAt: session.expiresAt.toISOString(),
              }))}
            />
          </div>
          <section className="settings-danger" aria-labelledby="signout-title">
            <div>
              <p className="eyebrow">Password and access</p>
              <h2 id="signout-title">Account access</h2>
              <p>
                Use the secure email reset flow to change your password, or end
                this browser session.
              </p>
              <Link href="/forgot-password">Reset password</Link>
            </div>
            <LogoutButton />
          </section>
        </div>
      </div>
    </DashboardShell>
  );
}
