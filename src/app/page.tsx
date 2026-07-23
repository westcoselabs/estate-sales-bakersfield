import Link from "next/link";

import { PublicShell } from "@/components/shells/shells";

export default function HomePage() {
  return (
    <PublicShell>
      <section aria-labelledby="foundation-title">
        <p>Estate &amp; Yard Sale Directory</p>
        <h1 id="foundation-title">Build your Bakersfield sale listing.</h1>
        <p>
          Create an account, verify your email, complete your organizer profile,
          and prepare an exact event draft for future payment.
        </p>
        <p>
          <Link href="/signup">Create an account</Link> or{" "}
          <Link href="/login">log in</Link>.
        </p>
      </section>
    </PublicShell>
  );
}
