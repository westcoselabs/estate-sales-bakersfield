import { describe, expect, it } from "vitest";

import { usesDeterministicStripe } from "@/modules/payments/infrastructure/payment-environment";
import { parseServerEnvironment } from "@/platform/config/env";

describe("payment provider environment selection", () => {
  it("keeps the deterministic provider limited to Local and Test", () => {
    expect(usesDeterministicStripe({ APP_ENV: "local" })).toBe(true);
    expect(usesDeterministicStripe({ APP_ENV: "test" })).toBe(true);
    expect(usesDeterministicStripe({ APP_ENV: "preview" })).toBe(false);
    expect(usesDeterministicStripe({ APP_ENV: "production" })).toBe(false);
  });

  it("uses the real provider path for an explicitly gated Production beta", () => {
    const environment = parseServerEnvironment({
      NODE_ENV: "production",
      APP_ENV: "production",
      PRODUCTION_BETA_MODE: "true",
      APP_URL: "https://production.example.test",
      LOG_LEVEL: "info",
      DATABASE_URL: "postgresql://example.test/database",
      DIRECT_URL: "postgresql://example.test/database",
      DATABASE_RESOURCE_ENV: "production",
      CRON_SECRET: "x".repeat(32),
      STRIPE_SECRET_KEY: `sk_test_${"x".repeat(24)}`,
      STRIPE_WEBHOOK_SECRET: `whsec_${"y".repeat(24)}`,
      STRIPE_PRICE_ID: "price_production_beta",
      STRIPE_EXPECTED_AMOUNT: "2000",
      STRIPE_EXPECTED_CURRENCY: "usd",
      STRIPE_MODE: "test",
      STRIPE_RESOURCE_ENV: "production",
      GEOAPIFY_API_KEY: "geoapify-production-beta-key",
      NEXT_PUBLIC_MAP_STYLE_URL: "https://tiles.openfreemap.org/styles/liberty",
    });

    expect(usesDeterministicStripe(environment)).toBe(false);
  });
});
