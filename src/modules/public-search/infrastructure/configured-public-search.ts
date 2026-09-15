import "server-only";

import { getPrismaClient } from "@/platform/database/client";

import { PublicSearchService } from "../application/public-search-service";
import {
  CachedPublicSearchService,
  type PublicSearchReader,
} from "../application/cached-public-search-service";
import { PrismaPublicSearchRepository } from "./prisma-public-search-repository";
import { nextPublicSearchCache } from "./next-public-search-cache";

export function createConfiguredPublicSearchService(): PublicSearchReader {
  const fresh = new PublicSearchService(
    new PrismaPublicSearchRepository(getPrismaClient()),
  );
  // Local/test executions do not have a Next data-cache runtime. Hosted preview
  // and production still share the same fail-closed visibility revision policy.
  return process.env.APP_ENV === "production" ||
    process.env.APP_ENV === "preview"
    ? new CachedPublicSearchService(fresh, nextPublicSearchCache)
    : fresh;
}
