import "server-only";

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { getServerEnvironment } from "@/platform/config/env";

declare global {
  var __estateSalesPrisma: PrismaClient | undefined;
}

function buildPrismaClient(): PrismaClient {
  const environment = getServerEnvironment();
  if (!environment.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to create the database client");
  }

  if (environment.DATABASE_DRIVER === "neon") {
    return new PrismaClient({
      adapter: new PrismaNeon({ connectionString: environment.DATABASE_URL }),
    });
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: environment.DATABASE_URL }),
  });
}

export function getPrismaClient(): PrismaClient {
  globalThis.__estateSalesPrisma ??= buildPrismaClient();
  return globalThis.__estateSalesPrisma;
}

export async function disconnectPrismaForTests(): Promise<void> {
  if (globalThis.__estateSalesPrisma) {
    await globalThis.__estateSalesPrisma.$disconnect();
    globalThis.__estateSalesPrisma = undefined;
  }
}
