import Link from "next/link";

import { PublicShell } from "@/components/shells/shells";

export default function EstateSalesHubPage() {
  return (
    <PublicShell>
      <section>
        <p>Estate Sales Bakersfield</p>
        <h1>Upcoming estate sales</h1>
        <p>
          Approved drafts are not public until a future publishing phase
          completes payment.
        </p>
        <Link href="/">Return home</Link>
      </section>
    </PublicShell>
  );
}
