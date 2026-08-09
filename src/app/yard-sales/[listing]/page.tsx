import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";

import {
  PublicListing,
  publicListingMetadata,
} from "@/app/_components/public-event-listing";
import { loadPublishedListing } from "@/app/_components/published-listing-loader";
import { PublicShell } from "@/components/shells/shells";

export const dynamic = "force-dynamic";

interface Props {
  readonly params: Promise<{ listing: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const value = (await params).listing;
  const listing = await loadPublishedListing("YARD_SALE", value);
  return listing
    ? publicListingMetadata(listing)
    : { title: "Yard sale not found", robots: { index: false } };
}

export default async function YardSaleListingPage({ params }: Props) {
  const value = (await params).listing;
  const listing = await loadPublishedListing("YARD_SALE", value);
  if (!listing) notFound();
  if (listing.canonicalPath !== `/yard-sales/${value}`) {
    if (listing.sourceKind === "EXTERNAL") redirect(listing.canonicalPath);
    permanentRedirect(listing.canonicalPath);
  }
  return (
    <PublicShell>
      <PublicListing listing={listing} />
    </PublicShell>
  );
}
