import { InvalidPasswordError } from "../domain/errors";

export const PASSWORD_MIN_CHARACTERS = 12;
export const PASSWORD_MAX_CHARACTERS = 128;
export const PASSWORD_MAX_UTF8_BYTES = 512;

export function assertPasswordPolicy(password: string): void {
  const characterCount = [...password].length;
  const byteCount = Buffer.byteLength(password, "utf8");

  if (
    characterCount < PASSWORD_MIN_CHARACTERS ||
    characterCount > PASSWORD_MAX_CHARACTERS ||
    byteCount > PASSWORD_MAX_UTF8_BYTES
  ) {
    throw new InvalidPasswordError(
      `Password must contain ${PASSWORD_MIN_CHARACTERS}-${PASSWORD_MAX_CHARACTERS} characters`,
    );
  }
}
