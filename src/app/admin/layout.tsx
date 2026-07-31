import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AdminShell } from "@/components/shells/admin-shell";
import {
  AuthorizationError,
  getCurrentUser,
  requireSuperAdminPrincipal,
} from "@/modules/auth";
import { sensitiveMetadata } from "@/platform/seo/indexing-policy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = sensitiveMetadata;

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");

  let administrator;
  try {
    administrator = requireSuperAdminPrincipal(current);
  } catch (error) {
    if (error instanceof AuthorizationError) notFound();
    throw error;
  }
  return (
    <AdminShell
      account={{ displayName: administrator.displayName, isSuperAdmin: true }}
    >
      {children}
    </AdminShell>
  );
}
