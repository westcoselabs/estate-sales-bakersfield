import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import type { ReactNode } from "react";

import { getServerApplicationUrl } from "@/platform/config/application-url";
import { publicRobots } from "@/platform/seo/indexing-policy";
import { GoogleAnalytics } from "./_components/google-analytics";

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
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
  },
  icons: {
    icon: [{ url: "/images/Logo-gold-black-favicon.webp", type: "image/webp" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className={manrope.variable}>
        {children}
        {process.env.APP_ENV === "production" && (
          <GoogleAnalytics
            measurementId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? ""}
            origin={getServerApplicationUrl().origin}
          />
        )}
      </body>
    </html>
  );
}
