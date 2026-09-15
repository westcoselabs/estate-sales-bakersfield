import {
  sitemapEntries,
  sitemapResponse,
  unavailableSitemap,
  xmlEscape,
} from "@/app/_components/sitemap-data";
import { getServerApplicationUrl } from "@/platform/config/application-url";
import { publicIndexingEnabled } from "@/platform/seo/indexing-policy";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ shard: string }> },
) {
  if (!publicIndexingEnabled()) return unavailableSitemap();
  const { shard } = await params;
  if (!shard.endsWith(".xml")) return unavailableSitemap();
  try {
    const entries = await sitemapEntries(shard.slice(0, -4), new Date());
    if (!entries) return unavailableSitemap();
    const base = getServerApplicationUrl();
    return sitemapResponse(
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map((entry) => `<url><loc>${xmlEscape(new URL(entry.path, base).toString())}</loc>${entry.lastModified ? `<lastmod>${entry.lastModified.toISOString()}</lastmod>` : ""}</url>`).join("")}</urlset>`,
    );
  } catch {
    return unavailableSitemap(503);
  }
}
