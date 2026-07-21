import Link from "next/link";

import { EmailRequestForm } from "../_components/auth-forms";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <main>
      <section>
        <h1>Reset your password</h1>
        <p>
          Enter your email. The response is the same whether or not an eligible
          account exists.
        </p>
        <EmailRequestForm
          endpoint="/api/auth/forgot-password"
          buttonLabel="Send reset link"
        />
        <p>
          <Link href="/login">Return to login</Link>
        </p>
      </section>
    </main>
  );
}
