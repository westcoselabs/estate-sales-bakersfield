import type {
  AuthenticationAccount,
  CurrentSession,
  EmailDeliveryRecord,
  SessionMetadata,
  SessionSummary,
} from "../domain/types";

export interface AuditContext {
  readonly actorUserId?: string;
  readonly requestId?: string;
}

export interface CreateStoredSessionInput {
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly passwordAuthenticatedAt: Date;
  readonly metadata: SessionMetadata;
  readonly audit: AuditContext;
}

export interface RotateStoredSessionInput {
  readonly currentTokenHash: string;
  readonly replacementTokenHash: string;
  readonly replacementExpiresAt: Date;
  readonly metadata: SessionMetadata;
  readonly now: Date;
  readonly audit: AuditContext;
}

export interface ReauthenticateStoredSessionInput {
  readonly currentTokenHash: string;
  readonly replacementTokenHash: string;
  readonly metadata: SessionMetadata;
  readonly now: Date;
  readonly audit: AuditContext;
}

export interface SessionRepository {
  create(input: CreateStoredSessionInput): Promise<CurrentSession>;
  findActiveByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<CurrentSession | null>;
  rotate(input: RotateStoredSessionInput): Promise<CurrentSession | null>;
  reauthenticate(
    input: ReauthenticateStoredSessionInput,
  ): Promise<CurrentSession | null>;
  deleteCurrent(tokenHash: string, audit: AuditContext): Promise<boolean>;
  deleteOwnedById(
    userId: string,
    sessionId: string,
    audit: AuditContext,
  ): Promise<boolean>;
  deleteAllForUser(userId: string, audit: AuditContext): Promise<number>;
  listForUser(userId: string): Promise<readonly SessionSummary[]>;
}

export interface OpaqueTokenProvider {
  generate(): string;
  hash(token: string): string;
}

export type SingleUseTokenKind = "EMAIL_VERIFICATION" | "PASSWORD_RESET";

export interface SingleUseTokenRepository {
  replaceActive(input: {
    readonly kind: SingleUseTokenKind;
    readonly userId: string;
    readonly tokenHash: string;
    readonly expiresAt: Date;
    readonly now: Date;
  }): Promise<void>;
  consume(input: {
    readonly kind: SingleUseTokenKind;
    readonly tokenHash: string;
    readonly now: Date;
  }): Promise<string | null>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(encodedHash: string, password: string): Promise<boolean>;
  needsRehash(encodedHash: string): boolean;
}

export type AuthenticationEmailKind = "EMAIL_VERIFICATION" | "PASSWORD_RESET";

export interface AuthenticationEmailMessage {
  readonly kind: AuthenticationEmailKind;
  readonly to: string;
  readonly displayName: string;
  readonly actionUrl: string;
  readonly idempotencyKey: string;
}

export interface EmailService {
  send(message: AuthenticationEmailMessage): Promise<{
    readonly providerMessageId: string;
    readonly templateRevisionId?: string;
  }>;
}

export interface AccountRepository {
  createWithVerification(input: {
    readonly displayName: string;
    readonly email: string;
    readonly normalizedEmail: string;
    readonly passwordHash: string;
    readonly verificationTokenHash: string;
    readonly verificationExpiresAt: Date;
    readonly recipientHash: string;
    readonly marketingOptIn: boolean;
    readonly consentAt: Date;
    readonly audit: AuditContext;
  }): Promise<
    | {
        readonly status: "CREATED";
        readonly account: AuthenticationAccount;
        readonly delivery: EmailDeliveryRecord;
      }
    | { readonly status: "CONFLICT" }
  >;
  findByNormalizedEmail(
    normalizedEmail: string,
  ): Promise<AuthenticationAccount | null>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;
  recordLogin(
    userId: string,
    superAdmin: boolean,
    audit: AuditContext,
  ): Promise<void>;
  issueVerification(input: {
    readonly normalizedEmail: string;
    readonly tokenHash: string;
    readonly expiresAt: Date;
    readonly recipientHash: string;
    readonly now: Date;
    readonly audit: AuditContext;
  }): Promise<{
    readonly account: AuthenticationAccount;
    readonly delivery: EmailDeliveryRecord;
  } | null>;
  verifyEmail(input: {
    readonly tokenHash: string;
    readonly now: Date;
    readonly audit: AuditContext;
    readonly sessionRotation?: {
      readonly currentTokenHash: string;
      readonly replacementTokenHash: string;
      readonly replacementExpiresAt: Date;
      readonly metadata: SessionMetadata;
    };
  }): Promise<
    | {
        readonly status: "VERIFIED";
        readonly account: AuthenticationAccount;
        readonly rotatedSession: CurrentSession | null;
      }
    | {
        readonly status: "ALREADY_VERIFIED";
        readonly account: AuthenticationAccount;
        readonly rotatedSession: null;
      }
    | null
  >;
  issuePasswordReset(input: {
    readonly normalizedEmail: string;
    readonly tokenHash: string;
    readonly expiresAt: Date;
    readonly recipientHash: string;
    readonly now: Date;
    readonly audit: AuditContext;
  }): Promise<{
    readonly account: AuthenticationAccount;
    readonly delivery: EmailDeliveryRecord;
  } | null>;
  resetPassword(input: {
    readonly tokenHash: string;
    readonly passwordHash: string;
    readonly now: Date;
    readonly audit: AuditContext;
  }): Promise<{
    readonly userId: string;
    readonly revokedSessionCount: number;
  } | null>;
  markDeliverySent(
    deliveryId: string,
    providerMessageId: string,
    now: Date,
    templateRevisionId?: string,
  ): Promise<void>;
  markDeliveryFailed(
    deliveryId: string,
    errorCode: string,
    now: Date,
  ): Promise<void>;
}

export interface RateLimitInput {
  readonly namespace: string;
  readonly identifier: string;
  readonly limit: number;
  readonly windowSeconds: number;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

export interface RateLimiter {
  consume(input: RateLimitInput): Promise<RateLimitDecision>;
}

export interface PrivacyFingerprint {
  create(value: string): string;
}
