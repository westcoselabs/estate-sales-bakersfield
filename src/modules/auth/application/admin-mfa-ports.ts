import type { CurrentSession } from "../domain/types";

export interface AdminMfaCredential {
  readonly userId: string;
  readonly encryptedSecret: string | null;
  readonly enabledAt: Date | null;
  readonly version: number;
  readonly lastUsedStep: number;
  readonly pendingEncryptedSecret: string | null;
  readonly pendingExpiresAt: Date | null;
  readonly pendingSessionId: string | null;
}

export interface AdminMfaCryptography {
  generateSecret(): string;
  encrypt(secret: string, userId: string): string;
  decrypt(ciphertext: string, userId: string): string;
  matchingStep(secret: string, code: string, now: Date): number | null;
  generateRecoveryCodes(): readonly string[];
  hashRecoveryCode(userId: string, code: string): string;
}

export interface MfaMutation {
  readonly session: CurrentSession;
  readonly credential: AdminMfaCredential;
  readonly now: Date;
  readonly requestId: string;
}

export interface AdminMfaRepository {
  find(userId: string): Promise<AdminMfaCredential | null>;
  startEnrollment(input: {
    readonly session: CurrentSession;
    readonly ciphertext: string;
    readonly now: Date;
    readonly requestId: string;
  }): Promise<void>;
  completeEnrollment(
    input: MfaMutation & {
      readonly step: number;
      readonly recoveryHashes: readonly string[];
      readonly replacementTokenHash: string;
    },
  ): Promise<boolean>;
  authenticate(
    input: MfaMutation & {
      readonly step: number | null;
      readonly recoveryHash: string | null;
      readonly replacementTokenHash: string;
    },
  ): Promise<boolean>;
  replaceRecoveryCodes(
    input: MfaMutation & {
      readonly recoveryHashes: readonly string[];
      readonly replacementTokenHash: string;
    },
  ): Promise<void>;
}
