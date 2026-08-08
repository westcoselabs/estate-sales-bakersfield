import "server-only";

import { getServerEnvironment } from "@/platform/config/env";
import { getPrismaClient } from "@/platform/database/client";
import { createConfiguredLocationProvider } from "@/modules/locations";

import { ListingImportAdminQueryService } from "../application/listing-import-admin-query-service";
import { ListingIngestionCredentialService } from "../application/credential-service";
import { ListingImportService } from "../application/listing-import-service";
import { ListingImportReviewService } from "../application/listing-import-review-service";
import { CryptoListingIngestionCredentialProvider } from "./crypto-listing-ingestion-credential-provider";
import { PrismaListingImportAdminQueryRepository } from "./prisma-listing-import-admin-query-repository";
import { PrismaListingImportRepository } from "./prisma-listing-import-repository";
import { PrismaListingImportReviewRepository } from "./prisma-listing-import-review-repository";
import { PrismaListingIngestionCredentialRepository } from "./prisma-listing-ingestion-credential-repository";

export function createConfiguredListingImportService(): ListingImportService {
  const environment = getServerEnvironment();
  return new ListingImportService(
    new PrismaListingImportRepository(getPrismaClient()),
    environment.APP_ENV,
  );
}

export function createConfiguredListingIngestionCredentialService(): ListingIngestionCredentialService {
  const environment = getServerEnvironment();
  return new ListingIngestionCredentialService(
    new PrismaListingIngestionCredentialRepository(getPrismaClient()),
    new CryptoListingIngestionCredentialProvider(),
    { production: environment.APP_ENV === "production" },
  );
}

export function createConfiguredListingImportAdminQueryService(): ListingImportAdminQueryService {
  return new ListingImportAdminQueryService(
    new PrismaListingImportAdminQueryRepository(getPrismaClient()),
  );
}

export function createConfiguredListingImportReviewService(): ListingImportReviewService {
  return new ListingImportReviewService(
    new PrismaListingImportReviewRepository(getPrismaClient()),
    createConfiguredLocationProvider(),
  );
}
