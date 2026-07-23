import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  AuthorizationError,
  getCurrentUser,
  requireAdminPrincipal,
} from "@/modules/auth";
import { sensitiveMetadata } from "@/platform/seo/indexing-policy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = sensitiveMetadata;

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
