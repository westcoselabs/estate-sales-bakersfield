import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AuthShell } from "@/components/shells/shells";
import { Alert } from "@/components/ui/primitives";
import { AdminMfaForm } from "@/features/auth/admin-mfa-form";
import {
  AuthenticationServiceUnavailableError,
  AuthorizationError,
  createConfiguredAdminMfaService,
  getCurrentSession,
  safeApplicationPath,
  requireSuperAdminIdentity,
} from "@/modules/auth";
import { sensitiveMetadata } from "@/platform/seo/indexing-policy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  ...sensitiveMetadata,
  title: "Administrator security",
};

export default async function SecurityPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ next?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login?next=%2Faccount%2Fsecurity");
  let status: { enabled: boolean; verified: boolean } | null = null;
  try {
    requireSuperAdminIdentity(session.principal);
    status = await createConfiguredAdminMfaService().status(session);
  } catch (error) {
    if (error instanceof AuthorizationError) notFound();
    if (!(error instanceof AuthenticationServiceUnavailableError)) throw error;
  }
  const nextPath = safeApplicationPath((await searchParams).next, "/admin");
  return (
    <AuthShell
      secondary={null}
      title="Administrator security"
      description="Authenticator setup is optional. Once enabled, it protects administrator access."
      eyebrow="Two-step verification"
    >
      {status ? (
        <AdminMfaForm
          enabled={status.enabled}
          verified={status.verified}
          nextPath={nextPath}
        />
      ) : (
        <Alert tone="error">
          {session.principal.mfaEnabled
            ? "Your enrolled authenticator is unavailable. The site operator must restore its encryption key."
            : "Optional authenticator setup is not configured. You can continue to use your administrator account with your password. An encryption key is needed only to set up an authenticator."}
        </Alert>
      )}
    </AuthShell>
  );
}
