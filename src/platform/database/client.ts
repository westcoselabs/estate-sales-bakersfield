import "server-only";

import { PrismaClient } from "@/generated/prisma/client";
import { getServerEnvironment } from "@/platform/config/env";
import { createNeonAdapter } from "@/platform/database/neon-adapter";

declare global {
  var __estateSalesPrisma: PrismaClient | undefined;
}

function buildPrismaClient(): PrismaClient {
  const environment = getServerEnvironment();
  if (!environment.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to create the database client");
  }

  return new PrismaClient({
    adapter: createNeonAdapter(environment.DATABASE_URL),
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
