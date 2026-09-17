import { describe, expect, it } from "vitest";

import {
  assertRequiredVariables,
  emailContentDigest,
  renderEmailTemplate,
  sanitizeEmailHtml,
} from "@/modules/email/application/rendering";
import { SYSTEM_EMAIL_DEFAULTS } from "@/modules/email/application/defaults";

describe("managed email rendering", () => {
  it("escapes text and inserts only explicitly trusted HTML", () => {
    const rendered = renderEmailTemplate({
      subject: "Hello {{DISPLAY_NAME}}",
      html: "<p>{{DISPLAY_NAME}}</p>{{{RECENT_LISTINGS_HTML}}}",
      values: { DISPLAY_NAME: '<img src=x onerror="alert(1)">' },
      trustedHtml: { RECENT_LISTINGS_HTML: "<strong>Trusted card</strong>" },
      text: "Fallback",
    });
    expect(rendered.html).toContain("&lt;img");
    expect(rendered.html).toContain("<strong>Trusted card</strong>");
  });

  it("rejects active content and preserves safe layout markup", () => {
    expect(() =>
      sanitizeEmailHtml(
        '<script>alert(1)</script><form><input></form><a href="javascript:alert(1)" onclick="bad()">Open</a>',
      ),
    ).toThrow(/scripts, forms/);
    expect(
      sanitizeEmailHtml("<table><tr><td>Safe</td></tr></table>"),
    ).toContain("<table>");
  });

  it("requires declared variables and creates deterministic digests", () => {
    expect(() =>
      assertRequiredVariables("<p>{{DISPLAY_NAME}}</p>", [
        "DISPLAY_NAME",
        "ACTION_URL",
      ]),
    ).toThrow(/ACTION_URL/);
    expect(emailContentDigest("Subject", "<p>Body</p>")).toBe(
      emailContentDigest("Subject", "<p>Body</p>"),
    );
    expect(emailContentDigest("Other", "<p>Body</p>")).not.toBe(
      emailContentDigest("Subject", "<p>Body</p>"),
    );
  });

  it("ships editable system templates for password reset and welcome email", () => {
    expect(SYSTEM_EMAIL_DEFAULTS.PASSWORD_RESET).toMatchObject({
      category: "TRANSACTIONAL",
      requiredVariables: ["DISPLAY_NAME", "ACTION_URL", "EXPIRY"],
    });
    expect(SYSTEM_EMAIL_DEFAULTS.WELCOME).toMatchObject({
      category: "TRANSACTIONAL",
      requiredVariables: ["DISPLAY_NAME", "ACTION_URL"],
    });
    expect(SYSTEM_EMAIL_DEFAULTS.WELCOME.html).toContain(
      "Explore estate sales",
    );
  });
});
