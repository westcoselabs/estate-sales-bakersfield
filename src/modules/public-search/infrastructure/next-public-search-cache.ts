import "server-only";

import { unstable_cache } from "next/cache";

import { getPrismaClient } from "@/platform/database/client";

import type { PublicSearchCache } from "../application/cached-public-search-service";

export const nextPublicSearchCache: PublicSearchCache = {
  async readRevision() {
    const rows = await getPrismaClient().$queryRaw<
      readonly { revision: bigint }[]
    >`SELECT revision FROM public_search_revision WHERE id = 1`;
    const revision = rows[0]?.revision;
    if (revision === undefined)
      throw new Error("Public search revision is unavailable");
    return String(revision);
  },
  readPage(key, load) {
    return unstable_cache(
      load,
      ["public-search-pages-v1", process.env.APP_ENV ?? "unknown", key],
      { revalidate: 30 },
    )();
  },
};
