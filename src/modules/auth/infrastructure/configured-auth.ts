import "server-only";

import { getServerEnvironment } from "@/platform/config/env";
import type { ServerEnvironment } from "@/platform/config/env";
import { getServerApplicationUrl } from "@/platform/config/application-url";
import { getPrismaClient } from "@/platform/database/client";

import { AuthenticationAbuseControl } from "../application/abuse-control";
import { SessionService } from "../application/session-service";
import { AuthenticationWorkflowService } from "../application/workflow-service";
import { AuthenticationServiceUnavailableError } from "../domain/errors";
import { Argon2PasswordHasher } from "./argon2-password-hasher";
import { CryptoOpaqueTokenProvider } from "./crypto-token-provider";
import { FileCaptureEmailService } from "./file-capture-email-service";
import { HmacPrivacyFingerprint } from "./hmac-privacy-fingerprint";
import { PrismaAccountRepository } from "./prisma-account-repository";
import { PrismaSessionRepository } from "./prisma-session-repository";
import { ResendEmailService } from "./resend-email-service";
import { TestMemoryRateLimiter } from "./test-memory-rate-limiter";
import { UpstashRateLimiter } from "./upstash-rate-limiter";

function configuredFingerprint(): HmacPrivacyFingerprint {
  const secret = getServerEnvironment().AUTH_FINGERPRINT_SECRET;
  if (!secret) {
    throw new AuthenticationServiceUnavailableError(
      "Authentication fingerprinting is not configured",
    );
  }
  return new HmacPrivacyFingerprint(secret);
}

export function authenticationEmailAdapterKind(
  environment: Pick<
    ServerEnvironment,
    "APP_ENV" | "AUTH_EMAIL_CAPTURE_PATH" | "RESEND_API_KEY" | "RESEND_FROM"
  >,
): "FILE_CAPTURE" | "RESEND" | null {
  if (["local", "test"].includes(environment.APP_ENV)) {
    return environment.AUTH_EMAIL_CAPTURE_PATH ? "FILE_CAPTURE" : null;
  }
  return environment.RESEND_API_KEY && environment.RESEND_FROM
    ? "RESEND"
    : null;
}

export function createConfiguredSessionService(): SessionService {
  return new SessionService(
    new PrismaSessionRepository(getPrismaClient()),
    new CryptoOpaqueTokenProvider(),
  );
}

export function createConfiguredAuthenticationWorkflow(): AuthenticationWorkflowService {
  const environment = getServerEnvironment();
  const emailKind = authenticationEmailAdapterKind(environment);
  const email =
    emailKind === "FILE_CAPTURE" && environment.AUTH_EMAIL_CAPTURE_PATH
      ? new FileCaptureEmailService(environment.AUTH_EMAIL_CAPTURE_PATH)
      : emailKind === "RESEND" &&
          environment.RESEND_API_KEY &&
          environment.RESEND_FROM
        ? new ResendEmailService(
            environment.RESEND_FROM,
            environment.RESEND_API_KEY,
          )
        : null;
  if (!email) {
    throw new AuthenticationServiceUnavailableError(
      "Transactional authentication email is not configured",
    );
  }

  return new AuthenticationWorkflowService(
    new PrismaAccountRepository(getPrismaClient()),
    new Argon2PasswordHasher(),
    new CryptoOpaqueTokenProvider(),
    createConfiguredSessionService(),
    email,
    configuredFingerprint(),
    getServerApplicationUrl(),
  );
}

export function createConfiguredAbuseControl(): AuthenticationAbuseControl {
  const environment = getServerEnvironment();
  if (environment.APP_ENV === "test") {
    return new AuthenticationAbuseControl(
      new TestMemoryRateLimiter(),
      configuredFingerprint(),
    );
  }
  if (
    !environment.UPSTASH_REDIS_REST_URL ||
    !environment.UPSTASH_REDIS_REST_TOKEN
  ) {
    throw new AuthenticationServiceUnavailableError(
      "Distributed authentication rate limiting is not configured",
    );
  }

  return new AuthenticationAbuseControl(
    new UpstashRateLimiter({
      environment: environment.APP_ENV,
      url: environment.UPSTASH_REDIS_REST_URL.toString(),
      token: environment.UPSTASH_REDIS_REST_TOKEN,
    }),
    configuredFingerprint(),
  );
}
