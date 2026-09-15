import {
  sitemapResponse,
  sitemapShards,
  unavailableSitemap,
  xmlEscape,
} from "@/app/_components/sitemap-data";
import { getServerApplicationUrl } from "@/platform/config/application-url";
import { publicIndexingEnabled } from "@/platform/seo/indexing-policy";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!publicIndexingEnabled()) return unavailableSitemap();
  try {
    const base = getServerApplicationUrl();
    const shards = await sitemapShards(new Date());
    return sitemapResponse(
      `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${shards.map((shard) => `<sitemap><loc>${xmlEscape(new URL(`/sitemaps/${shard}.xml`, base).toString())}</loc></sitemap>`).join("")}</sitemapindex>`,
    );
  } catch {
    return unavailableSitemap(503);
  }
}
