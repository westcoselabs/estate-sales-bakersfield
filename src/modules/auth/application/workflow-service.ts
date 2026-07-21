import { assertPasswordPolicy } from "./password-policy";
import type {
  AccountRepository,
  AuditContext,
  EmailService,
  OpaqueTokenProvider,
  PasswordHasher,
  PrivacyFingerprint,
} from "./ports";
import type { Clock } from "./session-service";
import { boundSessionMetadata, type SessionService } from "./session-service";
import { SESSION_TTL_MS } from "./session-cookie";
import {
  AccountConflictError,
  InvalidCredentialsError,
  InvalidTokenError,
  MalformedPasswordHashError,
} from "../domain/errors";
import type {
  AccountSummary,
  AuthenticationAccount,
  SessionGrant,
  SessionMetadata,
} from "../domain/types";

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

export const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,t=4,p=1$OoEm2bKVe35qnS7x67Oeiw$ra2EyLG58zxXiriAzMvolI4B1wwgfysFP4LzN+Qq1Wg";

function summarize(account: AuthenticationAccount): AccountSummary {
  return {
    id: account.id,
    displayName: account.displayName,
    email: account.email,
    emailVerified: account.emailVerifiedAt !== null,
    role: account.role,
    status: account.status,
  };
}

function actionUrl(baseUrl: URL, path: string, token: string): string {
  const url = new URL(path, baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

export interface RegistrationResult {
  readonly accepted: true;
  readonly emailDeliveryAttempted: boolean;
}

export class AuthenticationWorkflowService {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly passwords: PasswordHasher,
    private readonly tokens: OpaqueTokenProvider,
    private readonly sessions: SessionService,
    private readonly email: EmailService,
    private readonly fingerprints: PrivacyFingerprint,
    private readonly applicationUrl: URL,
    private readonly clock: Clock = () => new Date(),
  ) {}

  async register(
    input: {
      readonly displayName: string;
      readonly email: string;
      readonly password: string;
    },
    audit: AuditContext = {},
  ): Promise<RegistrationResult> {
    assertPasswordPolicy(input.password);
    const now = this.clock();
    const token = this.tokens.generate();
    const created = await this.accounts.createWithVerification({
      displayName: input.displayName,
      email: input.email,
      normalizedEmail: input.email,
      passwordHash: await this.passwords.hash(input.password),
      verificationTokenHash: this.tokens.hash(token),
      verificationExpiresAt: new Date(now.getTime() + VERIFICATION_TTL_MS),
      recipientHash: this.fingerprints.create(input.email),
      audit,
    });

    if (created.status === "CONFLICT") {
      throw new AccountConflictError("Registration could not be completed");
    }

    const sent = await this.deliver(
      created.delivery.id,
      {
        kind: "EMAIL_VERIFICATION",
        to: created.account.email,
        displayName: created.account.displayName,
        actionUrl: actionUrl(this.applicationUrl, "/verify-email", token),
        idempotencyKey: created.delivery.id,
      },
      now,
    );
    return { accepted: true, emailDeliveryAttempted: sent };
  }

  async login(
    normalizedEmail: string,
    password: string,
    metadata: SessionMetadata = {},
    audit: AuditContext = {},
  ): Promise<{
    readonly grant: SessionGrant;
    readonly account: AccountSummary;
  }> {
    const account = await this.accounts.findByNormalizedEmail(normalizedEmail);
    const encodedHash = account?.passwordHash ?? DUMMY_PASSWORD_HASH;
    let validPassword: boolean;
    try {
      validPassword = await this.passwords.verify(encodedHash, password);
    } catch (error) {
      if (!(error instanceof MalformedPasswordHashError) || !account) {
        throw error;
      }
      await this.passwords.verify(DUMMY_PASSWORD_HASH, password);
      throw error;
    }

    if (!account || !validPassword || account.status !== "ACTIVE") {
      throw new InvalidCredentialsError("Invalid email or password");
    }

    if (this.passwords.needsRehash(account.passwordHash)) {
      await this.accounts.updatePasswordHash(
        account.id,
        await this.passwords.hash(password),
      );
    }

    const grant = await this.sessions.create(account.id, metadata, {
      ...audit,
      actorUserId: account.id,
    });
    await this.accounts.recordLogin(account.id, {
      ...audit,
      actorUserId: account.id,
    });
    return { grant, account: summarize(account) };
  }

  async verifyEmail(
    rawToken: string,
    currentSessionToken: string | undefined,
    metadata: SessionMetadata = {},
    audit: AuditContext = {},
  ): Promise<{
    readonly account: AccountSummary;
    readonly rotatedSession: SessionGrant | null;
  }> {
    const now = this.clock();
    const replacementToken = currentSessionToken
      ? this.tokens.generate()
      : undefined;
    const verified = await this.accounts.verifyEmail({
      tokenHash: this.tokens.hash(rawToken),
      now,
      audit,
      ...(currentSessionToken && replacementToken
        ? {
            sessionRotation: {
              currentTokenHash: this.tokens.hash(currentSessionToken),
              replacementTokenHash: this.tokens.hash(replacementToken),
              replacementExpiresAt: new Date(now.getTime() + SESSION_TTL_MS),
              metadata: boundSessionMetadata(metadata),
            },
          }
        : {}),
    });
    if (!verified) {
      throw new InvalidTokenError(
        "This verification link is invalid or expired",
      );
    }

    const rotatedSession =
      replacementToken && verified.rotatedSession
        ? { token: replacementToken, session: verified.rotatedSession }
        : null;

    return { account: summarize(verified.account), rotatedSession };
  }

  async resendVerification(
    normalizedEmail: string,
    audit: AuditContext = {},
  ): Promise<void> {
    const now = this.clock();
    const token = this.tokens.generate();
    const issued = await this.accounts.issueVerification({
      normalizedEmail,
      tokenHash: this.tokens.hash(token),
      expiresAt: new Date(now.getTime() + VERIFICATION_TTL_MS),
      recipientHash: this.fingerprints.create(normalizedEmail),
      now,
      audit,
    });
    if (!issued) return;

    await this.deliver(
      issued.delivery.id,
      {
        kind: "EMAIL_VERIFICATION",
        to: issued.account.email,
        displayName: issued.account.displayName,
        actionUrl: actionUrl(this.applicationUrl, "/verify-email", token),
        idempotencyKey: issued.delivery.id,
      },
      now,
    );
  }

  async requestPasswordReset(
    normalizedEmail: string,
    audit: AuditContext = {},
  ): Promise<void> {
    const now = this.clock();
    const token = this.tokens.generate();
    const issued = await this.accounts.issuePasswordReset({
      normalizedEmail,
      tokenHash: this.tokens.hash(token),
      expiresAt: new Date(now.getTime() + RESET_TTL_MS),
      recipientHash: this.fingerprints.create(normalizedEmail),
      now,
      audit,
    });
    if (!issued) return;

    await this.deliver(
      issued.delivery.id,
      {
        kind: "PASSWORD_RESET",
        to: issued.account.email,
        displayName: issued.account.displayName,
        actionUrl: actionUrl(this.applicationUrl, "/reset-password", token),
        idempotencyKey: issued.delivery.id,
      },
      now,
    );
  }

  async resetPassword(
    rawToken: string,
    password: string,
    audit: AuditContext = {},
  ): Promise<void> {
    assertPasswordPolicy(password);
    const result = await this.accounts.resetPassword({
      tokenHash: this.tokens.hash(rawToken),
      passwordHash: await this.passwords.hash(password),
      now: this.clock(),
      audit,
    });
    if (!result) {
      throw new InvalidTokenError("This reset link is invalid or expired");
    }
  }

  private async deliver(
    deliveryId: string,
    message: Parameters<EmailService["send"]>[0],
    now: Date,
  ): Promise<boolean> {
    try {
      const result = await this.email.send(message);
      await this.accounts.markDeliverySent(
        deliveryId,
        result.providerMessageId,
        now,
      );
      return true;
    } catch (error) {
      const errorCode =
        error instanceof Error ? error.name.slice(0, 100) : "UNKNOWN";
      await this.accounts.markDeliveryFailed(deliveryId, errorCode, now);
      return false;
    }
  }
}
