import "server-only";

import { createHmac } from "node:crypto";

import type { PrivacyFingerprint } from "../application/ports";

export class HmacPrivacyFingerprint implements PrivacyFingerprint {
  constructor(private readonly secret: string) {
    if (secret.length < 32) {
      throw new Error("The authentication fingerprint secret is too short");
    }
  }

  create(value: string): string {
    return createHmac("sha256", this.secret)
      .update(value, "utf8")
      .digest("hex");
  }
}
