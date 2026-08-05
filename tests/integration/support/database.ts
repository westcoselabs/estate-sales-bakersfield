import { inject } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { createNeonAdapter } from "@/platform/database/neon-adapter";

export function createIntegrationClient(): PrismaClient {
  return new PrismaClient({
    adapter: createNeonAdapter(inject("databaseUrl")),
  });
}
