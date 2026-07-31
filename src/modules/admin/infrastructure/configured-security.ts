import "server-only";

import { PrismaAuthenticationRateLimiter } from "@/modules/auth";
import { getServerEnvironment } from "@/platform/config/env";
import { getPrismaClient } from "@/platform/database/client";

export function createConfiguredAdminRateLimiter() {
  const environment = getServerEnvironment();
  return new PrismaAuthenticationRateLimiter(getPrismaClient(), {
    environment: environment.APP_ENV,
    ...(environment.TEST_RUN_ID ? { scope: environment.TEST_RUN_ID } : {}),
  });
}
