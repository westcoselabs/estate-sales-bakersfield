import { describe, expect, it } from "vitest";
import { EncryptedTotpCryptography } from "@/modules/auth/infrastructure/admin-mfa-cryptography";
import { AuthenticationServiceUnavailableError } from "@/modules/auth/domain/errors";
import { Secret, TOTP } from "otpauth";

const crypto = new EncryptedTotpCryptography("11".repeat(32));

describe("administrator MFA cryptography", () => {
  it("checks RFC6238 SHA1 vectors, rejects malformed codes and returns a replay-checkable step", () => {
    const secret = Secret.fromLatin1("12345678901234567890").base32;
    // RFC6238's 8-digit values reduced to the configured six digits.
    for (const [timestamp, code] of [
      [59_000, "287082"],
      [1_111_111_109_000, "081804"],
      [1_234_567_890_000, "005924"],
    ] as const) {
      expect(crypto.matchingStep(secret, code, new Date(timestamp))).toBe(
        Math.floor(timestamp / 30_000),
      );
    }
    for (const invalid of ["2", "2870820", "abcdef", " 287082", "28708\n"])
      expect(crypto.matchingStep(secret, invalid, new Date(59000))).toBeNull();
  });

  it("accepts only adjacent time windows", () => {
    const secret = crypto.generateSecret();
    const now = new Date("2026-09-15T12:00:00Z");
    const totp = new TOTP({ secret });
    expect(
      crypto.matchingStep(
        secret,
        totp.generate({ timestamp: now.getTime() - 30_000 }),
        now,
      ),
    ).toBe(Math.floor(now.getTime() / 30_000) - 1);
    expect(
      crypto.matchingStep(
        secret,
        totp.generate({ timestamp: now.getTime() - 90_000 }),
        now,
      ),
    ).toBeNull();
  });

  it("authenticates encrypted secrets against the account and key; detects tampering", () => {
    const secret = crypto.generateSecret();
    const first = crypto.encrypt(secret, "owner-1");
    expect(first).not.toContain(secret);
    expect(crypto.encrypt(secret, "owner-1")).not.toBe(first);
    expect(crypto.decrypt(first, "owner-1")).toBe(secret);
    expect(() => crypto.decrypt(first, "owner-2")).toThrow(
      AuthenticationServiceUnavailableError,
    );
    expect(() =>
      new EncryptedTotpCryptography("22".repeat(32)).decrypt(first, "owner-1"),
    ).toThrow(AuthenticationServiceUnavailableError);
    expect(() =>
      crypto.decrypt(first.replace("v1.", "v2."), "owner-1"),
    ).toThrow(AuthenticationServiceUnavailableError);
    expect(() => new EncryptedTotpCryptography("")).toThrow(
      AuthenticationServiceUnavailableError,
    );
  });

  it("generates ten independent high-entropy recovery codes and account-bound digests", () => {
    const codes = crypto.generateRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    expect(
      codes.every((code) => /^(?:[a-f0-9]{4}-){7}[a-f0-9]{4}$/.test(code)),
    ).toBe(true);
    const first = codes[0]!;
    const hash = crypto.hashRecoveryCode("owner-1", first);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(
      crypto.hashRecoveryCode(
        "owner-1",
        first.replaceAll("-", "").toUpperCase(),
      ),
    );
    expect(hash).not.toBe(crypto.hashRecoveryCode("owner-2", first));
  });
});
