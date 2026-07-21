import "server-only";

import { getPrismaClient } from "@/platform/database/client";

import { OrganizerService } from "../application/organizer-service";
import { PrismaOrganizerProfileRepository } from "./prisma-organizer-profile-repository";

export function createConfiguredOrganizerService(): OrganizerService {
  return new OrganizerService(
    new PrismaOrganizerProfileRepository(getPrismaClient()),
  );
}
