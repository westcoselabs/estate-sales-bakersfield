import "server-only";

import { revalidatePath } from "next/cache";

import { getServerEnvironment } from "@/platform/config/env";
import { getPrismaClient } from "@/platform/database/client";
import { logger } from "@/platform/observability/logger";
import { createConfiguredLocationProvider } from "@/modules/locations";

import { ListingImportAdminQueryService } from "../application/listing-import-admin-query-service";
import {
  ExternalListingLifecycleService,
  type ExternalListingRevalidator,
} from "../application/external-listing-lifecycle";
import { ListingIngestionCredentialService } from "../application/credential-service";
import { ListingImportService } from "../application/listing-import-service";
import { ListingImportReviewService } from "../application/listing-import-review-service";
import { CryptoListingIngestionCredentialProvider } from "./crypto-listing-ingestion-credential-provider";
import { PrismaListingImportAdminQueryRepository } from "./prisma-listing-import-admin-query-repository";
import { PrismaListingImportRepository } from "./prisma-listing-import-repository";
import { PrismaListingImportReviewRepository } from "./prisma-listing-import-review-repository";
import { PrismaListingIngestionCredentialRepository } from "./prisma-listing-ingestion-credential-repository";

class NextExternalListingRevalidator implements ExternalListingRevalidator {
  revalidate(paths: readonly string[]): void {
    paths.forEach((path) => revalidatePath(path));
  }
}

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
    undefined,
    new NextExternalListingRevalidator(),
    (failure) => {
      logger.error(
        {
          operation: failure.operation,
          listingId: failure.listingId,
          paths: failure.paths,
          errorType: failure.errorType,
        },
        "External listing cache revalidation failed after a committed mutation",
      );
    },
  );
}

export function createConfiguredExternalListingLifecycleService(): ExternalListingLifecycleService {
  return new ExternalListingLifecycleService(
    new PrismaListingImportReviewRepository(getPrismaClient()),
    new NextExternalListingRevalidator(),
  );
}
