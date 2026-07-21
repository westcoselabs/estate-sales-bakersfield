import { RateLimitExceededError } from "../domain/errors";
import type { PrivacyFingerprint, RateLimitInput, RateLimiter } from "./ports";

export type AuthenticationRoute =
  | "REGISTER"
  | "LOGIN"
  | "RESEND_VERIFICATION"
  | "FORGOT_PASSWORD"
  | "RESET_PASSWORD";

interface LimitPolicy {
  readonly ip: Pick<RateLimitInput, "limit" | "windowSeconds">;
  readonly subject: Pick<RateLimitInput, "limit" | "windowSeconds">;
}

export const AUTHENTICATION_LIMITS: Readonly<
  Record<AuthenticationRoute, LimitPolicy>
> = {
  REGISTER: {
    ip: { limit: 5, windowSeconds: 15 * 60 },
    subject: { limit: 3, windowSeconds: 60 * 60 },
  },
  LOGIN: {
    ip: { limit: 20, windowSeconds: 15 * 60 },
    subject: { limit: 10, windowSeconds: 15 * 60 },
  },
  RESEND_VERIFICATION: {
    ip: { limit: 10, windowSeconds: 60 * 60 },
    subject: { limit: 3, windowSeconds: 60 * 60 },
  },
  FORGOT_PASSWORD: {
    ip: { limit: 10, windowSeconds: 60 * 60 },
    subject: { limit: 3, windowSeconds: 60 * 60 },
  },
  RESET_PASSWORD: {
    ip: { limit: 10, windowSeconds: 15 * 60 },
    subject: { limit: 5, windowSeconds: 15 * 60 },
  },
};

export class AuthenticationAbuseControl {
  constructor(
    private readonly limiter: RateLimiter,
    private readonly fingerprints: PrivacyFingerprint,
  ) {}

  async assertAllowed(
    route: AuthenticationRoute,
    networkIdentifier: string,
    subjectIdentifier: string,
  ): Promise<void> {
    const policy = AUTHENTICATION_LIMITS[route];
    const inputs: readonly RateLimitInput[] = [
      {
        namespace: `${route.toLowerCase()}:network`,
        identifier: this.fingerprints.create(networkIdentifier),
        ...policy.ip,
      },
      {
        namespace: `${route.toLowerCase()}:subject`,
        identifier: this.fingerprints.create(subjectIdentifier),
        ...policy.subject,
      },
    ];

    const decisions = await Promise.all(
      inputs.map((input) => this.limiter.consume(input)),
    );
    const denied = decisions.filter((decision) => !decision.allowed);
    if (denied.length > 0) {
      throw new RateLimitExceededError(
        Math.max(...denied.map((decision) => decision.retryAfterSeconds)),
      );
    }
  }
}
