import { describe, expect, it, vi } from "vitest";

import { OrganizerService } from "@/modules/organizers/application/organizer-service";
import type { OrganizerProfileRepository } from "@/modules/organizers/application/ports";
import { organizerProfileSchema } from "@/modules/organizers/application/schemas";

const profile = {
  id: "organizer-1",
  userId: "user-1",
  displayName: "Bakersfield Estate Services",
  contactName: "Test Owner",
  contactEmail: "owner@example.test",
  contactPhone: null,
  websiteUrl: null,
  status: "COMPLETE" as const,
  updatedAt: new Date("2026-07-17T12:00:00.000Z"),
};

describe("OrganizerService", () => {
  it("normalizes appropriate fields and marks complete onboarding", async () => {
    const repository = {
      findByUserId: vi.fn(async () => profile),
      saveForUser: vi.fn(async () => profile),
    } satisfies OrganizerProfileRepository;
    const service = new OrganizerService(repository);
    const input = organizerProfileSchema.parse({
      displayName: "  Bakersfield Estate Services ",
      contactName: " Test Owner ",
      contactEmail: " OWNER@Example.TEST ",
      contactPhone: "",
      websiteUrl: "",
    });

    const result = await service.saveForUser("user-1", input);

    expect(repository.saveForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        contactEmail: "owner@example.test",
        status: "COMPLETE",
      }),
    );
    expect(result).not.toHaveProperty("userId");
  });

  it("keeps partial onboarding incomplete and scopes lookup to the user", async () => {
    const repository = {
      findByUserId: vi.fn(async () => null),
      saveForUser: vi.fn(async () => ({
        ...profile,
        status: "INCOMPLETE" as const,
      })),
    } satisfies OrganizerProfileRepository;
    const service = new OrganizerService(repository);
    const input = organizerProfileSchema.parse({
      displayName: "Partial organizer",
    });

    await service.saveForUser("user-2", input);

    expect(repository.saveForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-2",
        status: "INCOMPLETE",
      }),
    );
  });
});
