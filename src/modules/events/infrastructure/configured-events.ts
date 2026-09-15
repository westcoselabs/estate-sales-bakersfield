import "server-only";

import { getServerEnvironment } from "@/platform/config/env";
import { getPrismaClient } from "@/platform/database/client";
import { createConfiguredLocationProvider } from "@/modules/locations";
import { PrismaAuthenticationRateLimiter } from "@/modules/auth";
import {
  createConfiguredImageProcessor,
  createConfiguredMediaStore,
} from "@/modules/media";

import { EventService } from "../application/event-service";
import { PrismaEventRepository } from "./prisma-event-repository";
import { DatabaseEventWorkLimiter } from "./event-work-limiter";

export function createConfiguredEventService(): EventService {
  const environment = getServerEnvironment();
  const prisma = getPrismaClient();
  return new EventService(
    new PrismaEventRepository(prisma),
    createConfiguredLocationProvider(),
    createConfiguredMediaStore(),
    createConfiguredImageProcessor(),
    environment.APP_ENV,
    undefined,
    new DatabaseEventWorkLimiter(
      new PrismaAuthenticationRateLimiter(prisma, {
        environment: environment.APP_ENV,
        ...(environment.TEST_RUN_ID ? { scope: environment.TEST_RUN_ID } : {}),
      }),
    ),
  );
}
