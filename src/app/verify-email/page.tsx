import Link from "next/link";

import { EmailRequestForm, VerifyEmailForm } from "../_components/auth-forms";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main>
      <section>
        <h1>Verify your email</h1>
        {token ? (
          <>
            <p>
              Confirm below to use this one-time verification link. Opening this
              page did not change your account.
            </p>
            <VerifyEmailForm token={token} />
          </>
        ) : (
          <>
            <p>Request a new verification link.</p>
            <EmailRequestForm
              endpoint="/api/auth/resend-verification"
              buttonLabel="Send verification link"
            />
          </>
        )}
        <p>
          <Link href="/login">Return to login</Link>
        </p>
      </section>
    </main>
  );
}
