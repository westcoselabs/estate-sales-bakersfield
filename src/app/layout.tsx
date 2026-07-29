import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import type { ReactNode } from "react";

import { getServerApplicationUrl } from "@/platform/config/application-url";
import { prelaunchRobots } from "@/platform/seo/indexing-policy";

import "./globals.css";
import "./foundation.css";
import "./marketplace.css";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  metadataBase: getServerApplicationUrl(),
  title: "Estate Sales Bakersfield",
  description: "Build and preview Bakersfield estate and yard sale listings",
  robots: prelaunchRobots,
  icons: {
    icon: [{ url: "/images/Logo-gold-black-favicon.webp", type: "image/webp" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className={manrope.variable}>{children}</body>
    </html>
  );
}
