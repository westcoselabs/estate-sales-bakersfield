import { describe, expect, it } from "vitest";

import { checkReleaseConfiguration } from "../../../scripts/release-config";

const local = {
  NODE_ENV: "development",
  LOG_LEVEL: "silent",
  APP_ENV: "local",
  APP_URL: "http://localhost:3000",
};

describe("release configuration boundaries", () => {
  it("permits local preparation without claiming operational launch readiness", () => {
    expect(checkReleaseConfiguration(local, "preparation")).toMatchObject({
      configuration: "pass",
      publicIndexing: false,
      livePayments: false,
      operationalEvidence: "not-verified",
    });
  });
  it("blocks local/test preparation from being presented as a public launch", () => {
    expect(checkReleaseConfiguration(local, "public-launch")).toMatchObject({
      configuration: "blocked",
      operationalEvidence: "not-verified",
    });
  });
  it("does not require optional MFA configuration to launch", () => {
    const result = checkReleaseConfiguration(local, "public-launch");
    expect(
      result.blockers.some((blocker) => blocker.includes("ADMIN_MFA")),
    ).toBe(false);
    expect(result.blockers).toContain(
      "Missing required setting: AUTH_FINGERPRINT_SECRET.",
    );
  });
  it("reports invalid field names without serializing secret inputs or validation messages", () => {
    const secret = "sensitive-fixture-do-not-log";
    const result = checkReleaseConfiguration(
      { ...local, APP_URL: secret, STRIPE_SECRET_KEY: secret },
      "preparation",
    );
    expect(result.configuration).toBe("blocked");
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result).toHaveProperty("invalidFields");
  });
  it("requires a coordinated release gate rather than accepting a public-indexing flag alone", () => {
    const result = checkReleaseConfiguration(
      {
        ...local,
        PUBLIC_INDEXING_ENABLED: "true",
      },
      "preparation",
    );
    expect(result.configuration).toBe("blocked");
  });
});
