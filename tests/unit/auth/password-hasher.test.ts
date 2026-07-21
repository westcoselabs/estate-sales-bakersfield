import { describe, expect, it } from "vitest";

import {
  InvalidPasswordError,
  MalformedPasswordHashError,
} from "@/modules/auth/domain/errors";
import {
  ARGON2_PARAMETERS,
  Argon2PasswordHasher,
} from "@/modules/auth/infrastructure/argon2-password-hasher";

describe("Argon2PasswordHasher", () => {
  const hasher = new Argon2PasswordHasher();

  it("hashes and verifies with the selected Argon2id parameters", async () => {
    const encoded = await hasher.hash("a-correct-horse-battery-staple");

    expect(encoded).toContain("$argon2id$v=19$");
    expect(encoded).toContain(`m=${ARGON2_PARAMETERS.memoryCost}`);
    await expect(
      hasher.verify(encoded, "a-correct-horse-battery-staple"),
    ).resolves.toBe(true);
    await expect(hasher.verify(encoded, "not-the-password")).resolves.toBe(
      false,
    );
    expect(hasher.needsRehash(encoded)).toBe(false);
  });

  it("rejects passwords outside the bounded policy", async () => {
    await expect(hasher.hash("too-short")).rejects.toBeInstanceOf(
      InvalidPasswordError,
    );
  });

  it("marks malformed and outdated hashes for rehashing", () => {
    expect(hasher.needsRehash("not-a-hash")).toBe(true);
    expect(hasher.needsRehash("$argon2id$v=19$m=65536,t=1,p=1$abc$xyz")).toBe(
      true,
    );
    expect(hasher.needsRehash("$argon2id$v=19$m=65536,t=2,p=1$abc$xyz")).toBe(
      true,
    );
  });

  it("surfaces malformed stored hashes as operational failures", async () => {
    await expect(
      hasher.verify("not-a-hash", "a-valid-password-value"),
    ).rejects.toBeInstanceOf(MalformedPasswordHashError);
  });
});
