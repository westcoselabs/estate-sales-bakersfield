import type {
  CurrentSession,
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

export interface SessionRepository {
  create(input: CreateStoredSessionInput): Promise<CurrentSession>;
  findActiveByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<CurrentSession | null>;
  rotate(input: RotateStoredSessionInput): Promise<CurrentSession | null>;
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
