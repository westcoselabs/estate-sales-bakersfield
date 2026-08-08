import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentSession } from "@/modules/auth";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  limiter: {},
  enforceAdminRateLimit: vi.fn(),
}));

vi.mock("@/modules/auth", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getCurrentSession: mocks.getCurrentSession,
}));

vi.mock("@/modules/admin", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createConfiguredAdminRateLimiter: vi.fn(() => mocks.limiter),
  enforceAdminRateLimit: mocks.enforceAdminRateLimit,
}));

vi.mock("@/platform/config/application-url", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getTrustedApplicationUrls: vi.fn(() => [new URL("http://localhost:3000")]),
}));

import { authorizeListingImportReview } from "@/app/api/admin/imports/_review-route";
import { AuthenticationError } from "@/modules/auth";
import { TrustedOriginError } from "@/platform/security/trusted-origin";

const administratorId = "10000000-0000-4000-8000-000000000001";
const sessionId = "20000000-0000-4000-8000-000000000001";
const targetId = "30000000-0000-4000-8000-000000000001";

function session(): CurrentSession {
  return {
    id: sessionId,
    userId: administratorId,
    createdAt: new Date("2026-08-07T18:00:00.000Z"),
    expiresAt: new Date("2026-08-07T20:00:00.000Z"),
    passwordAuthenticatedAt: new Date("2026-08-07T18:00:00.000Z"),
    metadata: {},
    principal: {
      id: administratorId,
      displayName: "Import Administrator",
      email: "admin@example.test",
      emailVerifiedAt: new Date("2026-08-07T18:00:00.000Z"),
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    },
  };
}

function request(origin: string | null): Request {
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  return new Request(
    `http://localhost:3000/api/admin/imports/candidates/${targetId}/approve`,
    { method: "POST", headers },
  );
}

beforeEach(() => {
  mocks.getCurrentSession.mockReset();
  mocks.getCurrentSession.mockResolvedValue(session());
  mocks.enforceAdminRateLimit.mockReset();
  mocks.enforceAdminRateLimit.mockResolvedValue(undefined);
});

describe("listing import review authorization helper", () => {
  it("binds a trusted super-admin session and target-scoped rate limit", async () => {
    await expect(
      authorizeListingImportReview(request("http://localhost:3000"), targetId),
    ).resolves.toEqual({ userId: administratorId, sessionId });
    expect(mocks.enforceAdminRateLimit).toHaveBeenCalledWith(
      mocks.limiter,
      "LISTING_IMPORT",
      administratorId,
      targetId,
    );
  });

  it("rejects an untrusted Origin before reading the session", async () => {
    await expect(
      authorizeListingImportReview(
        request("https://untrusted.invalid"),
        targetId,
      ),
    ).rejects.toBeInstanceOf(TrustedOriginError);
    expect(mocks.getCurrentSession).not.toHaveBeenCalled();
    expect(mocks.enforceAdminRateLimit).not.toHaveBeenCalled();
  });

  it("rejects a missing authenticated principal before rate limiting", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);
    await expect(
      authorizeListingImportReview(request("http://localhost:3000"), targetId),
    ).rejects.toBeInstanceOf(AuthenticationError);
    expect(mocks.enforceAdminRateLimit).not.toHaveBeenCalled();
  });
});
