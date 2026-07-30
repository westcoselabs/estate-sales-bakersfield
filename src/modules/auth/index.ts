export {
  Argon2PasswordHasher,
  ARGON2_PARAMETERS,
} from "./infrastructure/argon2-password-hasher";
export { benchmarkArgon2 } from "./infrastructure/argon2-benchmark";
export { CryptoOpaqueTokenProvider } from "./infrastructure/crypto-token-provider";
export {
  cleanupConfiguredAuthenticationRateLimits,
  createConfiguredAbuseControl,
  createConfiguredAuthenticationWorkflow,
  createConfiguredSessionService,
} from "./infrastructure/configured-auth";
export {
  clearSessionCookie,
  getCurrentSession,
  getCurrentSessionToken,
  getCurrentUser,
  requireAdmin,
  requireUser,
  requireVerifiedPublishingUser,
  setSessionCookie,
} from "./infrastructure/next-session-context";
export { PrismaAccountRepository } from "./infrastructure/prisma-account-repository";
export { PrismaSessionRepository } from "./infrastructure/prisma-session-repository";
export { PrismaSingleUseTokenRepository } from "./infrastructure/prisma-single-use-token-repository";
export {
  renderAuthenticationEmail,
  ResendEmailService,
} from "./infrastructure/resend-email-service";
export {
  authenticationRateLimitIdentifierHash,
  authenticationRateLimitScopeHash,
  PrismaAuthenticationRateLimiter,
} from "./infrastructure/prisma-authentication-rate-limiter";
export { HmacPrivacyFingerprint } from "./infrastructure/hmac-privacy-fingerprint";
export {
  AccountConflictError,
  AuthenticationError,
  AuthenticationServiceUnavailableError,
  AuthorizationError,
  EmailVerificationRequiredError,
  EmailDeliveryError,
  InvalidCredentialsError,
  InvalidPasswordError,
  InvalidTokenError,
  MalformedPasswordHashError,
  RateLimitExceededError,
} from "./domain/errors";
export { normalizeEmail } from "./domain/email";
export {
  requireAdminPrincipal,
  requireUserPrincipal,
  requireVerifiedPublishingPrincipal,
} from "./application/guards";
export {
  emailRequestSchema,
  loginSchema,
  passwordResetSchema,
  registrationSchema,
  tokenSchema,
} from "./application/schemas";
export { safeApplicationPath } from "./application/redirects";
export {
  AUTHENTICATION_LIMITS,
  AuthenticationAbuseControl,
} from "./application/abuse-control";
export { SessionService } from "./application/session-service";
export { SingleUseTokenService } from "./application/single-use-token-service";
export {
  AuthenticationWorkflowService,
  DUMMY_PASSWORD_HASH,
} from "./application/workflow-service";
export {
  getExpiredSessionCookieOptions,
  getSessionCookieName,
  getSessionCookieOptions,
  SESSION_TTL_MS,
} from "./application/session-cookie";
export type {
  AuditContext,
  AccountRepository,
  AuthenticationEmailKind,
  AuthenticationEmailMessage,
  EmailService,
  OpaqueTokenProvider,
  PasswordHasher,
  PrivacyFingerprint,
  RateLimitDecision,
  RateLimiter,
  SessionRepository,
  SingleUseTokenKind,
  SingleUseTokenRepository,
} from "./application/ports";
export type {
  AccountSummary,
  AccountStatus,
  AuthPrincipal,
  AuthenticationAccount,
  CurrentSession,
  SessionGrant,
  SessionMetadata,
  SessionSummary,
  UserRole,
} from "./domain/types";
