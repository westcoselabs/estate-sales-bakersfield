import Link from "next/link";

import { SignupForm } from "../_components/auth-forms";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <main>
      <section>
        <h1>Create your account</h1>
        <p>
          You can start an organizer profile before verification. Email
          verification is required before photo uploads and publishing.
        </p>
        <SignupForm />
        <p>
          Already have an account? <Link href="/login">Log in</Link>.
        </p>
      </section>
    </main>
  );
}
