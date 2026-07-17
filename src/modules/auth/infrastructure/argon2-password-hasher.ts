import { hash, verify, type Options } from "@node-rs/argon2";

import type { PasswordHasher } from "../application/ports";
import { assertPasswordPolicy } from "../application/password-policy";

export const ARGON2_PARAMETERS = Object.freeze({
  algorithm: 2,
  version: 1,
  memoryCost: 65_536,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} satisfies Options);

const PARAMETER_PATTERN = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/;

export class Argon2PasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    assertPasswordPolicy(password);
    return hash(password, ARGON2_PARAMETERS);
  }

  async verify(encodedHash: string, password: string): Promise<boolean> {
    try {
      return await verify(encodedHash, password);
    } catch {
      return false;
    }
  }

  needsRehash(encodedHash: string): boolean {
    const match = PARAMETER_PATTERN.exec(encodedHash);
    if (!match) return true;

    const [, memoryCost, timeCost, parallelism] = match;
    return (
      Number(memoryCost) !== ARGON2_PARAMETERS.memoryCost ||
      Number(timeCost) !== ARGON2_PARAMETERS.timeCost ||
      Number(parallelism) !== ARGON2_PARAMETERS.parallelism
    );
  }
}
