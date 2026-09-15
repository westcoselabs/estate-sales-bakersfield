import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as AuthModule from "@/modules/auth";
import type * as ApplicationUrlModule from "@/platform/config/application-url";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  assertAllowed: vi.fn(),
  enroll: vi.fn(),
  challenge: vi.fn(),
  confirmEnrollment: vi.fn(),
  regenerateRecoveryCodes: vi.fn(),
  setSessionCookie: vi.fn(),
}));

vi.mock("@/modules/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof AuthModule>()),
  getCurrentSession: mocks.getCurrentSession,
  createConfiguredAbuseControl: () => ({ assertAllowed: mocks.assertAllowed }),
  createConfiguredAdminMfaService: () => ({
    enroll: mocks.enroll,
    challenge: mocks.challenge,
    confirmEnrollment: mocks.confirmEnrollment,
    regenerateRecoveryCodes: mocks.regenerateRecoveryCodes,
  }),
  setSessionCookie: mocks.setSessionCookie,
}));

vi.mock("@/platform/config/application-url", async (importOriginal) => ({
  ...(await importOriginal<typeof ApplicationUrlModule>()),
  getTrustedApplicationUrls: () => [new URL("http://localhost:3000")],
}));

import { POST } from "@/app/api/auth/mfa/route";
import {
  AuthenticationServiceUnavailableError,
  MfaVerificationError,
  RateLimitExceededError,
} from "@/modules/auth";

const administratorId = "20000000-0000-4000-8000-000000000001";

function session(role = "SUPER_ADMIN") {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    userId: administratorId,
    expiresAt: new Date(Date.now() + 60_000),
    principal: {
      id: administratorId,
      role,
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  };
}

function request(body: unknown, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/auth/mfa", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "x-request-id": "admin-mfa-route-unit",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentSession.mockResolvedValue(session());
});

describe("administrator MFA HTTP boundary", () => {
  it("rejects untrusted origins before loading the account or generating secrets", async () => {
    const response = await POST(
      request({ action: "enroll", password: "password" }, "https://other.test"),
    );
    expect(response.status).toBe(403);
    expect(mocks.getCurrentSession).not.toHaveBeenCalled();
    expect(mocks.enroll).not.toHaveBeenCalled();
  });

  it.each([
    [null, 401],
    [session("USER"), 403],
  ])("requires an administrator identity", async (current, status) => {
    mocks.getCurrentSession.mockResolvedValue(current);
    const response = await POST(
      request({ action: "enroll", password: "password" }),
    );
    expect(response.status).toBe(status);
    expect(mocks.assertAllowed).not.toHaveBeenCalled();
    expect(mocks.enroll).not.toHaveBeenCalled();
  });

  it.each([
    [new RateLimitExceededError(45), 429],
    [new AuthenticationServiceUnavailableError(), 503],
  ])(
    "fails closed when attempts cannot be admitted",
    async (failure, status) => {
      mocks.assertAllowed.mockRejectedValue(failure);
      const response = await POST(
        request({ action: "challenge", code: "123456", recovery: false }),
      );
      expect(response.status).toBe(status);
      expect(mocks.assertAllowed).toHaveBeenCalledWith(
        "ADMIN_MFA",
        expect.any(String),
        administratorId,
      );
      if (status === 429)
        expect(response.headers.get("retry-after")).toBe("45");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(mocks.challenge).not.toHaveBeenCalled();
      expect(mocks.setSessionCookie).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["{", 400],
    [{ action: "confirm", code: "secret-in-invalid-input" }, 400],
    [{ action: "enroll", password: "password", extra: "not permitted" }, 400],
    ["x".repeat(2049), 413],
  ])(
    "bounds and validates input without reflecting secret values",
    async (body, status) => {
      const response = await POST(request(body));
      expect(response.status).toBe(status);
      expect(await response.text()).not.toContain("secret-in-invalid-input");
      expect(mocks.enroll).not.toHaveBeenCalled();
      expect(mocks.confirmEnrollment).not.toHaveBeenCalled();
    },
  );

  it("returns enrollment secrets in a non-cacheable body", async () => {
    const enrollment = {
      secret: "manual-enrollment-secret",
      issuer: "Estate Sales Bakersfield",
    };
    mocks.enroll.mockResolvedValue(enrollment);
    const response = await POST(
      request({ action: "enroll", password: "password" }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(enrollment);
  });

  it("sets the rotated session only as a cookie, returning recovery codes once", async () => {
    const grant = { token: "private-session-token", session: session() };
    mocks.confirmEnrollment.mockResolvedValue({
      grant,
      recoveryCodes: ["one-time-code"],
    });
    const response = await POST(request({ action: "confirm", code: "123456" }));
    expect(response.status).toBe(200);
    expect(mocks.setSessionCookie).toHaveBeenCalledWith(grant);
    expect(await response.json()).toEqual({
      verified: true,
      recoveryCodes: ["one-time-code"],
      requestId: "admin-mfa-route-unit",
    });
  });

  it("does not grant a session when proof is invalid or replayed", async () => {
    mocks.challenge.mockRejectedValue(
      new MfaVerificationError(
        "This code is invalid or has already been used.",
      ),
    );
    const response = await POST(
      request({ action: "challenge", code: "123456", recovery: false }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "MFA_INVALID" });
    expect(mocks.setSessionCookie).not.toHaveBeenCalled();
  });
});
