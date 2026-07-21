import { describe, expect, it } from "vitest";

import {
  authenticationApiError,
  authJson,
  readJson,
} from "@/app/api/auth/_shared";
import {
  AuthenticationError,
  InvalidCredentialsError,
  InvalidTokenError,
  MalformedPasswordHashError,
} from "@/modules/auth/domain/errors";

const request = new Request("https://application.example.test/api/auth/login", {
  headers: { "x-request-id": "unit-request" },
});

describe("enumeration-safe API errors", () => {
  it("returns the same login response for unknown, invalid, or unavailable accounts", async () => {
    const errors = [
      new InvalidCredentialsError("unknown account"),
      new InvalidCredentialsError("wrong password"),
      new AuthenticationError("restricted account"),
      new MalformedPasswordHashError("malformed stored hash"),
    ];
    const responses = errors.map((error) =>
      authenticationApiError(error, request, "auth.login"),
    );
    const bodies = await Promise.all(
      responses.map((response) => response.text()),
    );

    expect(new Set(responses.map((response) => response.status))).toEqual(
      new Set([401]),
    );
    expect(new Set(bodies).size).toBe(1);
    expect(bodies[0]).not.toContain("unknown");
    expect(bodies[0]).not.toContain("restricted");
    expect(bodies[0]).not.toContain("malformed");
  });

  it("returns a generic token response without internal reason details", async () => {
    const response = authenticationApiError(
      new InvalidTokenError("consumed token"),
      request,
      "auth.verify-email",
    );

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.not.toContain("consumed");
  });

  it("marks authentication responses no-store", () => {
    const response = authJson({ ok: true }, { requestId: "unit-request" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("treats malformed JSON as a safe client error", async () => {
    const malformedRequest = new Request(
      "https://application.example.test/api/auth/signup",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "malformed-request",
        },
        body: "{",
      },
    );

    const error = await readJson(malformedRequest).catch(
      (caught: unknown) => caught,
    );
    const response = authenticationApiError(
      error,
      malformedRequest,
      "auth.signup",
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Please check the submitted information.",
      requestId: "malformed-request",
    });
  });
});
