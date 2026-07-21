import "server-only";

import { getServerEnvironment } from "@/platform/config/env";
import { getPrismaClient } from "@/platform/database/client";
import { createConfiguredLocationProvider } from "@/modules/locations";
import {
  createConfiguredImageProcessor,
  createConfiguredMediaStore,
} from "@/modules/media";

import { EventService } from "../application/event-service";
import { PrismaEventRepository } from "./prisma-event-repository";

export function createConfiguredEventService(): EventService {
  return new EventService(
    new PrismaEventRepository(getPrismaClient()),
    createConfiguredLocationProvider(),
    createConfiguredMediaStore(),
    createConfiguredImageProcessor(),
    getServerEnvironment().APP_ENV,
  );
}
