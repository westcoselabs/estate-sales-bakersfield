import { createHash, randomBytes } from "node:crypto";

import type { ListingIngestionCredentialTokenProvider } from "../application/credential-ports";

const TOKEN_PREFIX = "esb_ing_";
const TOKEN_PAYLOAD_LENGTH = 43;
const TOKEN_LENGTH = TOKEN_PREFIX.length + TOKEN_PAYLOAD_LENGTH;
const DISPLAY_PREFIX_LENGTH = 24;
const TOKEN_PATTERN = /^esb_ing_[A-Za-z0-9_-]{43}$/u;

export class CryptoListingIngestionCredentialProvider implements ListingIngestionCredentialTokenProvider {
  generate(): string {
    return `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  }

  hash(rawToken: string): string {
    return createHash("sha256").update(rawToken, "utf8").digest("hex");
  }

  displayPrefix(rawToken: string): string {
    return rawToken.slice(0, DISPLAY_PREFIX_LENGTH);
  }

  isWellFormed(rawToken: string): boolean {
    return rawToken.length === TOKEN_LENGTH && TOKEN_PATTERN.test(rawToken);
  }
}
