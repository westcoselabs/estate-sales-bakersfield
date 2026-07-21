import Link from "next/link";

import { safeApplicationPath } from "@/modules/auth";

import { LoginForm } from "../_components/auth-forms";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ next?: string }>;
}) {
  const query = await searchParams;
  return (
    <main>
      <section>
        <h1>Log in</h1>
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
