import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getServerApplicationUrl } from "@/platform/config/application-url";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: getServerApplicationUrl(),
  title: "Estate Sales Bakersfield",
  description: "Build and preview Bakersfield estate and yard sale listings",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
