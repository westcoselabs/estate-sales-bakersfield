import "server-only";

import { getPrismaClient } from "@/platform/database/client";

import { PublicSearchService } from "../application/public-search-service";
import { PrismaPublicSearchRepository } from "./prisma-public-search-repository";

export function createConfiguredPublicSearchService(): PublicSearchService {
  return new PublicSearchService(
    new PrismaPublicSearchRepository(getPrismaClient()),
  );
}
