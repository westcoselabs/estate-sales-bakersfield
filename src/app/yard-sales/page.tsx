import Link from "next/link";

import { PublicShell } from "@/components/shells/shells";

export default function YardSalesHubPage() {
  return (
    <PublicShell>
      <section>
        <p>Yard Sales Bakersfield</p>
        <h1>Upcoming yard sales</h1>
        <p>
          Approved drafts are not public until a future publishing phase
          completes payment.
        </p>
        <Link href="/">Return home</Link>
      </section>
    </PublicShell>
  );
}
