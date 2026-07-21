import { describe, expect, it, vi } from "vitest";

import type { AuthenticationEmailMessage } from "@/modules/auth/application/ports";
import type { EmailDeliveryError } from "@/modules/auth/domain/errors";
import {
  renderAuthenticationEmail,
  ResendEmailService,
} from "@/modules/auth/infrastructure/resend-email-service";

const message: AuthenticationEmailMessage = {
  kind: "EMAIL_VERIFICATION",
  to: "person@example.test",
  displayName: "Person <script>",
  actionUrl: "https://preview.example.test/verify-email?token=raw-secret-token",
  idempotencyKey: "delivery-1",
};

describe("Resend authentication email contract", () => {
  it("constructs application-owned verification and reset content", () => {
    const verification = renderAuthenticationEmail(message);
    const reset = renderAuthenticationEmail({
      ...message,
      kind: "PASSWORD_RESET",
      actionUrl:
        "https://preview.example.test/reset-password?token=raw-reset-token",
    });

    expect(verification.subject).toContain("Verify");
    expect(verification.text).toContain(message.actionUrl);
    expect(verification.html).not.toContain("<script>");
    expect(reset.subject).toContain("Reset");
    expect(reset.text).toContain("1 hour");
  });

  it("keeps provider metadata free of raw tokens", async () => {
    const send = vi.fn(
      async (
        payload: unknown,
        options: { readonly idempotencyKey: string },
      ) => {
        void payload;
        void options;
        return {
          data: { id: "provider-message-1" },
          error: null,
        };
      },
    );
    const service = new ResendEmailService(
      "Accounts <accounts@example.test>",
      "test-api-key",
      { emails: { send } },
    );

    await expect(service.send(message)).resolves.toEqual({
      providerMessageId: "provider-message-1",
    });
    const options = send.mock.calls[0]?.[1];
    expect(JSON.stringify(options)).not.toContain("raw-secret-token");
    expect(options).toEqual({ idempotencyKey: "delivery-1" });
  });

  it("maps provider failures to an application-owned error", async () => {
    const service = new ResendEmailService(
      "Accounts <accounts@example.test>",
      "test-api-key",
      {
        emails: {
          send: vi.fn(async () => ({
            data: null,
            error: { name: "rate_limit_exceeded" },
          })),
        },
      },
    );

    await expect(service.send(message)).rejects.toMatchObject({
      name: "EmailDeliveryError",
      code: "rate_limit_exceeded",
    } satisfies Partial<EmailDeliveryError>);
  });
});
