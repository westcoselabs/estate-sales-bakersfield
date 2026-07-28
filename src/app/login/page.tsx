import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "@/app/_components/auth-forms";
import { AuthShell } from "@/components/shells/shells";
import { Alert } from "@/components/ui/primitives";
import { safeApplicationPath } from "@/modules/auth";
import { sensitiveMetadata } from "@/platform/seo/indexing-policy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { ...sensitiveMetadata, title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    next?: string;
    registered?: string;
    verified?: string;
    reset?: string;
  }>;
}) {
  const query = await searchParams;
  return (
    <AuthShell
      className="auth-shell--login-portal"
      eyebrow=""
      title="Welcome back"
      description="Sign in to your account"
      secondary={
        <p>
          No account? <Link href="/signup">Create account</Link>
        </p>
      }
    >
      {query.registered === "1" ? (
        <Alert tone="success">
          Check your email for verification instructions. You can sign in now
          and verify before uploading photos or publishing.
        </Alert>
      ) : null}
      {query.verified === "1" ? (
        <Alert tone="success">Email verified. Continue to login.</Alert>
      ) : null}
      {query.reset === "1" ? (
        <Alert tone="success">
          Password reset. Log in with your new password.
        </Alert>
      ) : null}
      <LoginForm nextPath={safeApplicationPath(query.next)} />
    </AuthShell>
  );
}
