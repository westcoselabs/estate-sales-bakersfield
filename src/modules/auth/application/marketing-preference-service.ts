import { requireUserPrincipal } from "./guards";
import type { AuditContext } from "./ports";
import type { AuthPrincipal } from "../domain/types";

export const MARKETING_CONSENT_VERSION = "marketing-v1";

export interface MarketingConsentRecord {
  readonly consentAt: Date | null;
  readonly consentVersion: string | null;
  readonly consentSource: "SIGNUP" | "ACCOUNT_SETTINGS" | null;
  readonly unsubscribedAt: Date | null;
}

export function hasExplicitMarketingConsent(
  preference: MarketingConsentRecord | null | undefined,
): boolean {
  return Boolean(
    preference?.consentAt &&
    preference.consentVersion === MARKETING_CONSENT_VERSION &&
    preference.consentSource &&
    !preference.unsubscribedAt,
  );
}

export interface MarketingPreferenceProjection extends MarketingConsentRecord {
  eligible: boolean;
}

export interface MarketingPreferenceRepository {
  find(userId: string): Promise<MarketingPreferenceProjection | null>;
  update(
    userId: string,
    subscribed: boolean,
    now: Date,
    audit: AuditContext,
  ): Promise<MarketingPreferenceProjection>;
}

export class MarketingPreferenceService {
  constructor(
    private readonly repository: MarketingPreferenceRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async get(
    principal: AuthPrincipal | null,
  ): Promise<MarketingPreferenceProjection | null> {
    const user = requireUserPrincipal(principal);
    return this.repository.find(user.id);
  }

  async update(
    principal: AuthPrincipal | null,
    subscribed: boolean,
    audit: AuditContext = {},
  ): Promise<MarketingPreferenceProjection> {
    const user = requireUserPrincipal(principal);
    return this.repository.update(user.id, subscribed, this.clock(), {
      ...audit,
      actorUserId: user.id,
    });
  }
}
