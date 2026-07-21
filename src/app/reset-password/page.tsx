import Link from "next/link";

import { ResetPasswordForm } from "../_components/auth-forms";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main>
      <section>
        <h1>Choose a new password</h1>
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <p>This reset link is incomplete or invalid.</p>
        )}
        <p>
          <Link href="/forgot-password">Request another reset link</Link>
        </p>
      </section>
    </main>
  );
}
