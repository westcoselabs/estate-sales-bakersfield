import { PrismaNeon } from "@prisma/adapter-neon";
import { inject } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";

export function createIntegrationClient(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaNeon({ connectionString: inject("databaseUrl") }),
  });
}
