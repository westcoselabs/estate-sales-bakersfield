import "server-only";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import {
  createConfiguredPublicSearchService,
  normalizeSearchQuery,
  PublicSearchCursorError,
  type PublicSearchRawQuery,
} from "@/modules/public-search";
import { publicRobots } from "@/platform/seo/indexing-policy";
import { marketingMetadata } from "@/features/marketing/metadata";

import { listingRequestTime } from "./published-listing-loader";

export const salesHubs = {
  estate: {
    path: "/estate-sales",
    sale: "estate",
    date: "all",
    title: "Upcoming Estate Sales in Bakersfield, CA",
    heading: "Upcoming estate sales",
    description:
      "Browse published Bakersfield estate sales, preview the listings, and plan your next visit.",
  },
  yard: {
    path: "/yard-sales",
    sale: "yard",
    date: "all",
    title: "Upcoming Yard Sales in Bakersfield, CA",
    heading: "Upcoming yard sales",
    description:
      "Find upcoming Bakersfield yard sales with sale dates, location notes, and published listing details.",
  },
  "estate-weekend": {
    path: "/estate-sales/this-weekend",
    sale: "estate",
    date: "weekend",
    title: "Estate Sales This Weekend in Bakersfield, CA",
    heading: "Bakersfield estate sales this weekend",
    description:
      "Plan this weekend's Bakersfield estate-sale visits with current sale listings, local dates, and address availability.",
  },
  "yard-weekend": {
    path: "/yard-sales/this-weekend",
    sale: "yard",
    date: "weekend",
    title: "Yard Sales This Weekend in Bakersfield, CA",
    heading: "Bakersfield yard sales this weekend",
    description:
      "Find Bakersfield yard sales this weekend, check the schedule, and browse published listings before you head out.",
  },
  today: {
    path: "/sales-today",
    sale: "all",
    date: "today",
    title: "Estate Sales and Yard Sales Today in Bakersfield, CA",
    heading: "Estate sales and yard sales today in Bakersfield",
    description:
      "See estate sales and yard sales scheduled in Bakersfield today, with current listing details and local sale times.",
  },
} as const;

export type SalesHubKey = keyof typeof salesHubs;

export function salesHubHref(
  key: SalesHubKey,
  cursor: string | null = null,
): string {
  const path = salesHubs[key].path;
  return cursor
    ? `${path}?${new URLSearchParams({ cursor }).toString()}`
    : path;
}

export function salesHubCursor(raw: PublicSearchRawQuery): string | null {
  const cursor = raw.cursor;
  if (cursor === undefined) return null;
  if (typeof cursor !== "string" || !/^[A-Za-z0-9_-]{8,500}$/u.test(cursor))
    notFound();
  return cursor;
}

export const loadSalesHub = cache(
  async (key: SalesHubKey, cursor: string | null) => {
    const hub = salesHubs[key];
    const criteria = normalizeSearchQuery({
      sale: hub.sale,
      date: hub.date,
      view: "list",
      ...(cursor ? { cursor } : {}),
    }).criteria;
    try {
      const result = await createConfiguredPublicSearchService().search(
        criteria,
        listingRequestTime(),
        24,
      );
      if (cursor && result.items.length === 0) notFound();
      return result;
    } catch (error) {
      if (error instanceof PublicSearchCursorError) notFound();
      throw error;
    }
  },
);

export async function salesHubMetadata(
  key: SalesHubKey,
  raw: PublicSearchRawQuery,
): Promise<Metadata> {
  const cursor = salesHubCursor(raw);
  // Reject forged/mismatched cursors before emitting an indexable page.
  if (cursor) await loadSalesHub(key, cursor);
  const hub = salesHubs[key];
  return {
    ...marketingMetadata({
      title: cursor ? `${hub.title} — More sales` : hub.title,
      description: hub.description,
      path: salesHubHref(key, cursor),
    }),
    robots: publicRobots(),
  };
}
