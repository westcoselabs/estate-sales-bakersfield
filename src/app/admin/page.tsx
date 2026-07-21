import { redirect } from "next/navigation";

import {
  AuthorizationError,
  getCurrentUser,
  requireAdminPrincipal,
} from "@/modules/auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login?next=/admin");

  try {
    requireAdminPrincipal(current);
  } catch (error) {
    if (!(error instanceof AuthorizationError)) throw error;
    return (
      <main>
        <section>
          <h1>Access denied</h1>
          <p>Administrator access is required.</p>
        </section>
      </main>
    );
  }

  return (
    <main>
      <section>
        <h1>Administrator access confirmed</h1>
        <p>No administrator workflows are implemented in Phase 2.</p>
      </section>
    </main>
  );
}
