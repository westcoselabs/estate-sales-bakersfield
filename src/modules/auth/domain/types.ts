export type UserRole = "USER" | "SUPER_ADMIN";
export type AccountStatus = "ACTIVE" | "RESTRICTED" | "DISABLED";

export interface AuthPrincipal {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
  readonly emailVerifiedAt: Date | null;
  readonly role: UserRole;
  readonly status: AccountStatus;
}

export interface SessionMetadata {
  readonly userAgent?: string;
  readonly deviceLabel?: string;
}

export interface CurrentSession {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly passwordAuthenticatedAt: Date;
  readonly principal: AuthPrincipal;
  readonly metadata: SessionMetadata;
}

export interface SessionSummary {
  readonly id: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly metadata: SessionMetadata;
}

export interface SessionGrant {
  readonly token: string;
  readonly session: CurrentSession;
}

export interface AuthenticationAccount extends AuthPrincipal {
  readonly normalizedEmail: string;
  readonly passwordHash: string;
}

export interface AccountSummary {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly role: UserRole;
  readonly status: AccountStatus;
}

export interface EmailDeliveryRecord {
  readonly id: string;
  readonly userId: string;
}
