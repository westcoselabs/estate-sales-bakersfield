import type { MetadataRoute } from "next";

import { getServerApplicationUrl } from "@/platform/config/application-url";
import { publicIndexingEnabled } from "@/platform/seo/indexing-policy";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/dashboard"],
    },
    ...(publicIndexingEnabled()
      ? {
          sitemap: new URL(
            "/sitemap.xml",
            getServerApplicationUrl(),
          ).toString(),
        }
      : {}),
  };
}
