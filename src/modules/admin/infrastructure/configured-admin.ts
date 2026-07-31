import "server-only";

import { getServerEnvironment } from "@/platform/config/env";
import { getPrismaClient } from "@/platform/database/client";

import { AdminOverviewReporting } from "../application/overview-reporting";
import { PrismaOverviewReportingRepository } from "./prisma-overview-reporting-repository";
import {
  AdminMarketingExport,
  AdminUserDetail,
  AdminUserDirectory,
  AdminUserManagement,
} from "../application/users";
import { PrismaAdminUserRepository } from "./prisma-admin-user-repository";
import {
  AdminEventDetail,
  AdminListingDirectory,
  AdminListingModeration,
} from "../application/listings";
import { PrismaAdminListingRepository } from "./prisma-admin-listing-repository";
import { createConfiguredPaymentService } from "@/modules/payments";
import { revalidatePath } from "next/cache";

export function createConfiguredAdminOverviewReporting() {
  return new AdminOverviewReporting(
    new PrismaOverviewReportingRepository(getPrismaClient()),
    getServerEnvironment().STRIPE_EXPECTED_CURRENCY ?? "usd",
  );
}

function userRepository() {
  return new PrismaAdminUserRepository(getPrismaClient());
}

export function createConfiguredAdminUserDirectory() {
  return new AdminUserDirectory(userRepository());
}

export function createConfiguredAdminUserDetail() {
  return new AdminUserDetail(userRepository());
}

export function createConfiguredAdminUserManagement() {
  return new AdminUserManagement(userRepository());
}

export function createConfiguredAdminMarketingExport() {
  return new AdminMarketingExport(userRepository());
}

function listingRepository() {
  return new PrismaAdminListingRepository(getPrismaClient());
}

export function createConfiguredAdminListingDirectory() {
  return new AdminListingDirectory(listingRepository());
}

export function createConfiguredAdminEventDetail() {
  return new AdminEventDetail(listingRepository());
}

export function createConfiguredAdminListingModeration() {
  return new AdminListingModeration(
    listingRepository(),
    (eventId, requestId) =>
      createConfiguredPaymentService().expireOpenCheckoutForAdminRemoval(
        eventId,
        requestId ? { requestId } : {},
      ),
    (paths) => paths.forEach((path) => revalidatePath(path)),
  );
}
