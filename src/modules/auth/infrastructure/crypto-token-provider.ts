import { createHash, randomBytes } from "node:crypto";

import type { OpaqueTokenProvider } from "../application/ports";

export class CryptoOpaqueTokenProvider implements OpaqueTokenProvider {
  generate(): string {
    return randomBytes(32).toString("base64url");
  }

  hash(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }
}
