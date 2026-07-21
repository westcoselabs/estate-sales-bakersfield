import { describe, expect, it, vi } from "vitest";

import type {
  OpaqueTokenProvider,
  SessionRepository,
} from "@/modules/auth/application/ports";
import { SessionService } from "@/modules/auth/application/session-service";
import type { CurrentSession } from "@/modules/auth/domain/types";

const now = new Date("2026-07-16T12:00:00.000Z");

function sessionFixture(id = "session-1"): CurrentSession {
  return {
    id,
    userId: "user-1",
    expiresAt: new Date("2026-08-15T12:00:00.000Z"),
    createdAt: now,
    metadata: {},
    principal: {
      id: "user-1",
      displayName: "Test user",
      email: "person@example.test",
      emailVerifiedAt: null,
      role: "USER",
      status: "ACTIVE",
    },
  };
}

function dependencies() {
  const repository = {
    create: vi.fn(async () => sessionFixture()),
    findActiveByTokenHash: vi.fn(async () => sessionFixture()),
    rotate: vi.fn(async () => sessionFixture("session-2")),
    deleteCurrent: vi.fn(async () => true),
    deleteOwnedById: vi.fn(async () => true),
    deleteAllForUser: vi.fn(async () => 2),
    listForUser: vi.fn(async () => []),
  } satisfies SessionRepository;
  const tokens = {
    generate: vi.fn(() => "raw-session-token"),
    hash: vi.fn((token: string) => `hash:${token}`),
  } satisfies OpaqueTokenProvider;
  return { repository, tokens };
}

describe("SessionService", () => {
  it("passes only a token hash to persistence and bounds metadata", async () => {
    const { repository, tokens } = dependencies();
    const service = new SessionService(repository, tokens, () => now);

    const grant = await service.create("user-1", {
      userAgent: "a".repeat(600),
      deviceLabel: "b".repeat(120),
    });

    expect(grant.token).toBe("raw-session-token");
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        tokenHash: "hash:raw-session-token",
        metadata: { userAgent: "a".repeat(512), deviceLabel: "b".repeat(100) },
      }),
    );
    expect(JSON.stringify(repository.create.mock.calls)).not.toContain(
      '"raw-session-token"',
    );
  });

  it("hashes reads, rotation, logout, and ownership-scoped revocation", async () => {
    const { repository, tokens } = dependencies();
    const service = new SessionService(repository, tokens, () => now);

    await expect(service.read("presented")).resolves.toMatchObject({
      id: "session-1",
    });
    await expect(service.rotate("presented")).resolves.toMatchObject({
      token: "raw-session-token",
      session: { id: "session-2" },
    });
    await expect(service.logout("presented")).resolves.toBe(true);
    await expect(service.revokeSession("user-1", "session-2")).resolves.toBe(
      true,
    );
    await expect(service.revokeAll("user-1")).resolves.toBe(2);

    expect(repository.findActiveByTokenHash).toHaveBeenCalledWith(
      "hash:presented",
      now,
    );
    expect(repository.rotate).toHaveBeenCalledWith(
      expect.objectContaining({ currentTokenHash: "hash:presented" }),
    );
    expect(repository.deleteCurrent).toHaveBeenCalledWith("hash:presented", {});
    expect(repository.deleteOwnedById).toHaveBeenCalledWith(
      "user-1",
      "session-2",
      {},
    );
  });
});
