import { describe, expect, it } from "vitest";

import {
  hasExplicitMarketingConsent,
  MARKETING_CONSENT_VERSION,
} from "@/modules/auth/application/marketing-preference-service";

const consent = {
  consentAt: new Date("2026-08-25T12:00:00.000Z"),
  consentVersion: MARKETING_CONSENT_VERSION,
  consentSource: "SIGNUP" as const,
  unsubscribedAt: null,
};

describe("marketing consent eligibility", () => {
  it("requires a current explicit local consent record", () => {
    expect(hasExplicitMarketingConsent(null)).toBe(false);
    expect(hasExplicitMarketingConsent({ ...consent, consentAt: null })).toBe(
      false,
    );
    expect(
      hasExplicitMarketingConsent({ ...consent, consentVersion: "legacy" }),
    ).toBe(false);
    expect(
      hasExplicitMarketingConsent({ ...consent, consentSource: null }),
    ).toBe(false);
    expect(
      hasExplicitMarketingConsent({
        ...consent,
        unsubscribedAt: new Date("2026-08-25T13:00:00.000Z"),
      }),
    ).toBe(false);
    expect(hasExplicitMarketingConsent(consent)).toBe(true);
  });
});
