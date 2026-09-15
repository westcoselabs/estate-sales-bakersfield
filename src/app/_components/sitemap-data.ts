import "server-only";

import { parsePublicationSnapshot } from "@/modules/payments";
import { getPrismaClient } from "@/platform/database/client";
import { importedListingIndexingEnabled } from "@/platform/seo/indexing-policy";

import { externalListingAttribution } from "./published-listing-loader";

export const SITEMAP_PAGE_SIZE = 1_000;
export const sitemapPagePaths = [
  "/",
  "/estate-sales",
  "/yard-sales",
  "/estate-sales/this-weekend",
  "/yard-sales/this-weekend",
  "/sales-today",
  "/about",
  "/how-it-works",
  "/list-your-sale",
  "/faq",
  "/contact",
  "/privacy",
  "/terms",
] as const;
export type SitemapEntry = {
  readonly path: string;
  readonly lastModified?: Date;
};
const LISTING_PATH =
  /^\/(estate-sales|yard-sales)\/[a-z0-9-]+-([0-9a-f]{12})$/u;

export function organizerSitemapEntry(
  row: {
    readonly snapshot: unknown;
    readonly canonicalPath: string;
    readonly publicId: string;
    readonly publishedAt: Date;
  },
  now: Date,
): SitemapEntry | null {
  try {
    const projection = parsePublicationSnapshot(row.snapshot).projection;
    const match = LISTING_PATH.exec(row.canonicalPath);
    if (
      !match ||
      match[2] !== row.publicId ||
      projection.path !== row.canonicalPath ||
      (projection.eventType === "ESTATE_SALE"
        ? "estate-sales"
        : "yard-sales") !== match[1] ||
      new Date(projection.endsAt) <= now ||
      new Date(projection.endsAt) <= new Date(projection.startsAt)
    )
      return null;
    return { path: row.canonicalPath, lastModified: row.publishedAt };
  } catch {
    return null;
  }
}

export function externalSitemapEntry(
  row: {
    readonly publicId: string;
    readonly slug: string;
    readonly canonicalPath: string;
    readonly eventType: "ESTATE_SALE" | "YARD_SALE";
    readonly startsAt: Date;
    readonly endsAt: Date;
    readonly timezone: string;
    readonly updatedAt: Date;
    readonly attribution: unknown;
    readonly primarySourceRecord: {
      readonly sourceListingId: string;
      readonly source: { readonly id: string; readonly key: string };
    };
  },
  now: Date,
): SitemapEntry | null {
  const hub = row.eventType === "ESTATE_SALE" ? "estate-sales" : "yard-sales";
  if (
    !LISTING_PATH.test(row.canonicalPath) ||
    row.canonicalPath !== `/${hub}/${row.slug}-${row.publicId}` ||
    row.endsAt <= now ||
    row.endsAt <= row.startsAt ||
    !externalListingAttribution(row)
  )
    return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: row.timezone });
  } catch {
    return null;
  }
  return { path: row.canonicalPath, lastModified: row.updatedAt };
}

function organizerWhere(now: Date) {
  return {
    searchDocument: { endsAt: { gt: now } },
    event: {
      canceledAt: null,
      deletedAt: null,
      removedAt: null,
      organizer: { user: { status: "ACTIVE" as const } },
      location: { confirmationStatus: "CONFIRMED" as const },
    },
  };
}
function externalWhere(now: Date) {
  return {
    status: "PUBLISHED" as const,
    removedAt: null,
    endsAt: { gt: now },
    location: { confirmationStatus: "CONFIRMED" as const },
    primarySourceRecord: { linkedEventId: null },
  };
}

export async function sitemapShards(now: Date): Promise<readonly string[]> {
  const prisma = getPrismaClient();
  const [organizer, external] = await Promise.all([
    prisma.eventPublication.count({ where: organizerWhere(now) }),
    importedListingIndexingEnabled()
      ? prisma.externalListing.count({ where: externalWhere(now) })
      : Promise.resolve(0),
  ]);
  return [
    "pages",
    ...Array.from(
      { length: Math.ceil(organizer / SITEMAP_PAGE_SIZE) },
      (_, page) => `organizer-${String(page)}`,
    ),
    ...Array.from(
      { length: Math.ceil(external / SITEMAP_PAGE_SIZE) },
      (_, page) => `external-${String(page)}`,
    ),
  ];
}

export async function sitemapEntries(
  shard: string,
  now: Date,
): Promise<readonly SitemapEntry[] | null> {
  if (shard === "pages") return sitemapPagePaths.map((path) => ({ path }));
  const match = /^(organizer|external)-(0|[1-9]\d{0,4})$/u.exec(shard);
  if (!match) return null;
  if (match[1] === "external" && !importedListingIndexingEnabled()) return null;
  const page = Number(match[2]);
  const prisma = getPrismaClient();
  if (match[1] === "organizer") {
    const count = await prisma.eventPublication.count({
      where: organizerWhere(now),
    });
    if (page * SITEMAP_PAGE_SIZE >= count) return null;
    const rows = await prisma.eventPublication.findMany({
      where: organizerWhere(now),
      orderBy: { publicId: "asc" },
      skip: page * SITEMAP_PAGE_SIZE,
      take: SITEMAP_PAGE_SIZE,
      select: {
        snapshot: true,
        canonicalPath: true,
        publicId: true,
        publishedAt: true,
      },
    });
    return rows.length
      ? rows.flatMap((row) => {
          const entry = organizerSitemapEntry(row, now);
          return entry ? [entry] : [];
        })
      : null;
  }
  const count = await prisma.externalListing.count({
    where: externalWhere(now),
  });
  if (page * SITEMAP_PAGE_SIZE >= count) return null;
  const rows = await prisma.externalListing.findMany({
    where: externalWhere(now),
    orderBy: { publicId: "asc" },
    skip: page * SITEMAP_PAGE_SIZE,
    take: SITEMAP_PAGE_SIZE,
    select: {
      publicId: true,
      slug: true,
      canonicalPath: true,
      eventType: true,
      startsAt: true,
      endsAt: true,
      timezone: true,
      updatedAt: true,
      attribution: true,
      primarySourceRecord: {
        select: {
          sourceListingId: true,
          source: { select: { id: true, key: true } },
        },
      },
    },
  });
  return rows.length
    ? rows.flatMap((row) => {
        const entry = externalSitemapEntry(row, now);
        return entry ? [entry] : [];
      })
    : null;
}

export function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function sitemapResponse(xml: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${xml}`, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function unavailableSitemap(status: 404 | 503 = 404): Response {
  return new Response(
    status === 404 ? "Not found" : "Sitemap temporarily unavailable",
    {
      status,
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
    },
  );
}
