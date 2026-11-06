import { describe, expect, it } from "vitest";
import { suppressionRecipient } from "@/modules/email/application/webhook-suppression";

describe("provider suppression recipient", () => {
  it("normalizes contact opt-outs and individual delivery failures", () => {
    expect(
      suppressionRecipient("contact.updated", {
        email: " Person@Example.com ",
        unsubscribed: true,
      }),
    ).toBe("person@example.com");
    for (const type of [
      "email.bounced",
      "email.complained",
      "email.suppressed",
    ]) {
      expect(suppressionRecipient(type, { to: ["Person@Example.com"] })).toBe(
        "person@example.com",
      );
    }
  });
  it("does not suppress resubscriptions, successful deliveries, or ambiguous recipients", () => {
    expect(
      suppressionRecipient("contact.updated", {
        email: "a@example.com",
        unsubscribed: false,
      }),
    ).toBeNull();
    expect(
      suppressionRecipient("email.delivered", { to: ["a@example.com"] }),
    ).toBeNull();
    expect(
      suppressionRecipient("email.bounced", {
        to: ["a@example.com", "b@example.com"],
      }),
    ).toBeNull();
  });
});
