import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { Secret, TOTP } from "otpauth";

import type { AdminMfaCryptography } from "../application/admin-mfa-ports";
import { AuthenticationServiceUnavailableError } from "../domain/errors";

export class EncryptedTotpCryptography implements AdminMfaCryptography {
  private readonly key: Buffer;
  constructor(key: string) {
    if (!/^[a-fA-F0-9]{64}$/.test(key))
      throw new AuthenticationServiceUnavailableError(
        "Administrator MFA encryption is not configured",
      );
    this.key = Buffer.from(key, "hex");
  }
  generateSecret(): string {
    return new Secret({ size: 20 }).base32;
  }
  encrypt(secret: string, userId: string): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, nonce);
    cipher.setAAD(Buffer.from(`admin-mfa:v1:${userId}`));
    const ciphertext = Buffer.concat([
      cipher.update(secret, "utf8"),
      cipher.final(),
    ]);
    return [
      "v1",
      nonce.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      ciphertext.toString("base64url"),
    ].join(".");
  }
  decrypt(value: string, userId: string): string {
    try {
      const [version, nonce, tag, ciphertext, extra] = value.split(".");
      if (version !== "v1" || !nonce || !tag || !ciphertext || extra)
        throw new Error();
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.key,
        Buffer.from(nonce, "base64url"),
      );
      decipher.setAAD(Buffer.from(`admin-mfa:v1:${userId}`));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new AuthenticationServiceUnavailableError(
        "Administrator MFA credential is unavailable",
      );
    }
  }
  matchingStep(secret: string, code: string, now: Date): number | null {
    if (!/^\d{6}$/.test(code)) return null;
    const totp = new TOTP({
      secret: Secret.fromBase32(secret),
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    });
    const delta = totp.validate({
      token: code,
      timestamp: now.getTime(),
      window: 1,
    });
    return delta === null ? null : Math.floor(now.getTime() / 30_000) + delta;
  }
  generateRecoveryCodes(): readonly string[] {
    return Array.from({ length: 10 }, () =>
      randomBytes(16).toString("hex").match(/.{4}/g)!.join("-"),
    );
  }
  hashRecoveryCode(userId: string, code: string): string {
    return createHash("sha256")
      .update(
        `admin-mfa-recovery:v1:${userId}:${code.replaceAll("-", "").toLowerCase()}`,
      )
      .digest("hex");
  }
}
