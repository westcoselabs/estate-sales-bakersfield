import {
  MfaRequiredError,
  MfaVerificationError,
  InvalidCredentialsError,
} from "../domain/errors";
import type { CurrentSession, SessionGrant } from "../domain/types";
import type {
  AccountRepository,
  OpaqueTokenProvider,
  PasswordHasher,
} from "./ports";
import type {
  AdminMfaCryptography,
  AdminMfaRepository,
} from "./admin-mfa-ports";
import {
  requireSuperAdminIdentity,
  requireSuperAdminPrincipal,
} from "./guards";
import type { SessionService } from "./session-service";

export const MFA_ENROLLMENT_TTL_MS = 10 * 60 * 1000;

export class AdminMfaService {
  constructor(
    private readonly repository: AdminMfaRepository,
    private readonly cryptography: AdminMfaCryptography,
    private readonly accounts: AccountRepository,
    private readonly passwords: PasswordHasher,
    private readonly tokens: OpaqueTokenProvider,
    private readonly sessions: SessionService,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private requireSession(session: CurrentSession | null): CurrentSession {
    requireSuperAdminIdentity(session?.principal ?? null);
    if (!session || session.expiresAt <= this.clock())
      throw new InvalidCredentialsError("Session expired");
    return session;
  }

  private requireRecentMfa(session: CurrentSession): void {
    requireSuperAdminPrincipal(session.principal);
    if (
      !session.mfaAuthenticatedAt ||
      this.clock().getTime() - session.mfaAuthenticatedAt.getTime() >
        15 * 60 * 1000
    ) {
      throw new MfaRequiredError(
        "Confirm your authenticator or a recovery code before changing security settings",
      );
    }
  }

  private async verifyPassword(
    session: CurrentSession,
    password: string,
  ): Promise<void> {
    const account = await this.accounts.findByNormalizedEmail(
      session.principal.email,
    );
    if (
      !account ||
      account.id !== session.userId ||
      !(await this.passwords.verify(account.passwordHash, password))
    ) {
      throw new InvalidCredentialsError("Password confirmation failed");
    }
  }

  async status(current: CurrentSession | null) {
    const session = this.requireSession(current);
    const credential = await this.repository.find(session.userId);
    return {
      enabled: Boolean(credential?.enabledAt),
      verified: Boolean(session.principal.mfaAuthenticatedAt),
    };
  }

  async enroll(
    current: CurrentSession | null,
    password: string,
    requestId: string,
  ) {
    const session = this.requireSession(current);
    await this.verifyPassword(session, password);
    const credential = await this.repository.find(session.userId);
    if (credential?.enabledAt) this.requireRecentMfa(session);
    const secret = this.cryptography.generateSecret();
    const now = this.clock();
    await this.repository.startEnrollment({
      session,
      ciphertext: this.cryptography.encrypt(secret, session.userId),
      now,
      requestId,
    });
    return {
      secret,
      accountName: session.principal.email,
      issuer: "Estate Sales Bakersfield",
      expiresAt: new Date(now.getTime() + MFA_ENROLLMENT_TTL_MS).toISOString(),
    };
  }

  async confirmEnrollment(
    current: CurrentSession | null,
    code: string,
    requestId: string,
  ) {
    const session = this.requireSession(current);
    const credential = await this.repository.find(session.userId);
    const now = this.clock();
    if (
      !credential?.pendingEncryptedSecret ||
      credential.pendingSessionId !== session.id ||
      !credential.pendingExpiresAt ||
      credential.pendingExpiresAt <= now
    )
      throw new MfaVerificationError("Enrollment expired; start again");
    const step = this.cryptography.matchingStep(
      this.cryptography.decrypt(
        credential.pendingEncryptedSecret,
        session.userId,
      ),
      code,
      now,
    );
    if (step === null)
      throw new MfaVerificationError("The verification code was not accepted");
    const recoveryCodes = this.cryptography.generateRecoveryCodes();
    const token = this.tokens.generate();
    const accepted = await this.repository.completeEnrollment({
      session,
      credential,
      now,
      requestId,
      step,
      recoveryHashes: recoveryCodes.map((value) =>
        this.cryptography.hashRecoveryCode(session.userId, value),
      ),
      replacementTokenHash: this.tokens.hash(token),
    });
    if (!accepted)
      throw new MfaVerificationError("Enrollment expired; start again");
    return { grant: await this.grant(token), recoveryCodes };
  }

  async challenge(
    current: CurrentSession | null,
    code: string,
    recovery: boolean,
    requestId: string,
  ): Promise<SessionGrant> {
    const session = this.requireSession(current);
    const credential = await this.repository.find(session.userId);
    if (!credential?.enabledAt || !credential.encryptedSecret)
      throw new MfaVerificationError("Set up your authenticator first");
    const now = this.clock();
    const step = recovery
      ? null
      : this.cryptography.matchingStep(
          this.cryptography.decrypt(credential.encryptedSecret, session.userId),
          code,
          now,
        );
    if (!recovery && (step === null || step <= credential.lastUsedStep))
      throw new MfaVerificationError(
        "Use a new authenticator code or an unused recovery code",
      );
    const token = this.tokens.generate();
    const accepted = await this.repository.authenticate({
      session,
      credential,
      now,
      requestId,
      step,
      recoveryHash: recovery
        ? this.cryptography.hashRecoveryCode(session.userId, code)
        : null,
      replacementTokenHash: this.tokens.hash(token),
    });
    if (!accepted)
      throw new MfaVerificationError(
        "Use a new authenticator code or an unused recovery code",
      );
    return this.grant(token);
  }

  async regenerateRecoveryCodes(
    current: CurrentSession | null,
    password: string,
    requestId: string,
  ) {
    const session = this.requireSession(current);
    this.requireRecentMfa(session);
    await this.verifyPassword(session, password);
    const credential = await this.repository.find(session.userId);
    if (!credential?.enabledAt)
      throw new MfaVerificationError("Set up your authenticator first");
    const recoveryCodes = this.cryptography.generateRecoveryCodes();
    const token = this.tokens.generate();
    await this.repository.replaceRecoveryCodes({
      session,
      credential,
      now: this.clock(),
      requestId,
      recoveryHashes: recoveryCodes.map((value) =>
        this.cryptography.hashRecoveryCode(session.userId, value),
      ),
      replacementTokenHash: this.tokens.hash(token),
    });
    return { grant: await this.grant(token), recoveryCodes };
  }

  private async grant(token: string): Promise<SessionGrant> {
    const session = await this.sessions.read(token);
    if (!session) throw new InvalidCredentialsError("Session expired");
    return { token, session };
  }
}
