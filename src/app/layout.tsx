import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import type { ReactNode } from "react";

import { getServerApplicationUrl } from "@/platform/config/application-url";
import { publicRobots } from "@/platform/seo/indexing-policy";

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
  description:
    "Find upcoming estate sales and yard sales in Bakersfield, California.",
  robots: publicRobots(),
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
