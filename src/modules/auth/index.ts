export {
  Argon2PasswordHasher,
  ARGON2_PARAMETERS,
} from "./infrastructure/argon2-password-hasher";
export { benchmarkArgon2 } from "./infrastructure/argon2-benchmark";
export { CryptoOpaqueTokenProvider } from "./infrastructure/crypto-token-provider";
export {
  clearSessionCookie,
  getCurrentSession,
  getCurrentUser,
  requireAdmin,
  requireUser,
  setSessionCookie,
} from "./infrastructure/next-session-context";
export { PrismaSessionRepository } from "./infrastructure/prisma-session-repository";
export { PrismaSingleUseTokenRepository } from "./infrastructure/prisma-single-use-token-repository";
export {
  AuthenticationError,
  AuthorizationError,
  InvalidPasswordError,
} from "./domain/errors";
export { normalizeEmail } from "./domain/email";
export {
  requireAdminPrincipal,
  requireUserPrincipal,
} from "./application/guards";
export { SessionService } from "./application/session-service";
export { SingleUseTokenService } from "./application/single-use-token-service";
export {
  getExpiredSessionCookieOptions,
  getSessionCookieName,
  getSessionCookieOptions,
  SESSION_TTL_MS,
} from "./application/session-cookie";
export type {
  AuditContext,
  OpaqueTokenProvider,
  PasswordHasher,
  SessionRepository,
  SingleUseTokenKind,
  SingleUseTokenRepository,
} from "./application/ports";
export type {
  AccountStatus,
  AuthPrincipal,
  CurrentSession,
  SessionGrant,
  SessionMetadata,
  SessionSummary,
  UserRole,
} from "./domain/types";
