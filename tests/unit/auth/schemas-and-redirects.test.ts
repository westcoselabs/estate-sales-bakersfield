import { describe, expect, it } from "vitest";

import { safeApplicationPath } from "@/modules/auth/application/redirects";
import {
  loginSchema,
  passwordResetSchema,
  registrationSchema,
} from "@/modules/auth/application/schemas";

describe("authentication input boundaries", () => {
  it("normalizes email but never trims or normalizes passwords", () => {
    const password = "  twelve-characters  ";
    const parsed = registrationSchema.parse({
      displayName: "  Test Person  ",
      email: "  Person@Example.TEST ",
      password,
      passwordConfirmation: password,
    });

    expect(parsed.displayName).toBe("Test Person");
    expect(parsed.email).toBe("person@example.test");
    expect(parsed.password).toBe(password);
  });

  it("enforces password confirmation and bounded login input", () => {
    expect(() =>
      registrationSchema.parse({
        displayName: "Test Person",
        email: "person@example.test",
        password: "one-valid-password",
        passwordConfirmation: "another-valid-password",
      }),
    ).toThrow();
    expect(() =>
      loginSchema.parse({
        email: "person@example.test",
        password: "x".repeat(129),
      }),
    ).toThrow();
    expect(() =>
      passwordResetSchema.parse({
        token: "x".repeat(64),
        password: "short",
        passwordConfirmation: "short",
      }),
    ).toThrow();
  });
});

describe("same-origin redirect policy", () => {
  it("accepts application paths and rejects external or malformed targets", () => {
    expect(safeApplicationPath("/dashboard?tab=sessions")).toBe(
      "/dashboard?tab=sessions",
    );
    expect(safeApplicationPath("https://attacker.test")).toBe("/dashboard");
    expect(safeApplicationPath("//attacker.test/path")).toBe("/dashboard");
    expect(safeApplicationPath("/\\attacker.test")).toBe("/dashboard");
  });
});
