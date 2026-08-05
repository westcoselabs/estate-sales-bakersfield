import "server-only";

import { getServerEnvironment } from "@/platform/config/env";
import { getPrismaClient } from "@/platform/database/client";

import { ListingIngestionCredentialService } from "../application/credential-service";
import { ListingImportService } from "../application/listing-import-service";
import { CryptoListingIngestionCredentialProvider } from "./crypto-listing-ingestion-credential-provider";
import { PrismaListingImportRepository } from "./prisma-listing-import-repository";
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
