import Link from "next/link";

import { safeApplicationPath } from "@/modules/auth";

import { LoginForm } from "../_components/auth-forms";

export const dynamic = "force-dynamic";

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
    <main>
      <section>
        <h1>Log in</h1>
        {query.registered === "1" ? (
          <div className="success-box" role="status">
            Check your email for verification instructions. You can sign in now
            and verify before uploading photos or publishing.
          </div>
        ) : null}
        {query.verified === "1" ? (
          <div className="success-box" role="status">
            Email verified. Continue to login.
          </div>
        ) : null}
        {query.reset === "1" ? (
          <div className="success-box" role="status">
            Password reset. Log in with your new password.
          </div>
        ) : null}
        <LoginForm nextPath={safeApplicationPath(query.next)} />
        <p>
          <Link href="/forgot-password">Forgot your password?</Link>
        </p>
        <p>
          Need an account? <Link href="/signup">Sign up</Link>.
        </p>
      </section>
    </main>
  );
}
