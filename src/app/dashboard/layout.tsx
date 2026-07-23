import type { Metadata } from "next";
import type { ReactNode } from "react";

import { sensitiveMetadata } from "@/platform/seo/indexing-policy";

export const metadata: Metadata = sensitiveMetadata;

export default function DashboardLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return children;
}
