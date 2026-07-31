import { requireUserPrincipal } from "./guards";
import type { AuditContext } from "./ports";
import type { AuthPrincipal } from "../domain/types";

export interface MarketingPreferenceProjection {
  consentAt: Date | null;
  consentVersion: string | null;
  consentSource: "SIGNUP" | "ACCOUNT_SETTINGS" | null;
  unsubscribedAt: Date | null;
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
