import "server-only";

import { Resend } from "resend";

import { logger } from "@/platform/observability/logger";

import type {
  AuthenticationEmailMessage,
  EmailService,
} from "../application/ports";
import { EmailDeliveryError } from "../domain/errors";

interface ResendClient {
  readonly emails: {
    send(
      payload: {
        readonly from: string;
        readonly to: string[];
        readonly subject: string;
        readonly text: string;
        readonly html: string;
      },
      options: { readonly idempotencyKey: string },
    ): Promise<{
      readonly data: { readonly id: string } | null;
      readonly error: { readonly name: string } | null;
    }>;
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Readonly<Record<string, string>> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

export function renderAuthenticationEmail(message: AuthenticationEmailMessage) {
  const verification = message.kind === "EMAIL_VERIFICATION";
  const subject = verification
    ? "Verify your Estate Sales Bakersfield email"
    : "Reset your Estate Sales Bakersfield password";
  const action = verification ? "Verify email" : "Reset password";
  const expiry = verification ? "24 hours" : "1 hour";
  const preheader = verification
    ? "Confirm your email to approve and publish your event."
    : "Use this secure link to choose a new password.";
  const heading = verification ? "Verify your email" : "Reset your password";
  const explanation = verification
    ? "Confirm your email address to approve your event, continue to payment, and publish your listing."
    : "We received a request to reset your password. Use the secure button below to choose a new one.";
  const securityNotice = verification
    ? "If you did not create an Estate Sales Bakersfield account, you can safely ignore this email."
    : "If you did not request a password reset, you can safely ignore this email. Your password will not change.";
  const safeName = escapeHtml(message.displayName);
  const safeUrl = escapeHtml(message.actionUrl);
  const text = [
    "ESTATE SALES BAKERSFIELD",
    "",
    heading,
    "",
    `Hi ${message.displayName},`,
    "",
    explanation,
    "",
    `${action}:`,
    message.actionUrl,
    "",
    `This link expires in ${expiry} and can be used once.`,
    "",
    "If the button does not work, copy and paste the link above into your browser.",
    "",
    securityNotice,
    "",
    "Estate Sales Bakersfield",
    "Bakersfield, California",
  ].join("\n");
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>${subject}</title>
    <style>
      @media only screen and (max-width: 620px) {
        .email-shell { width: 100% !important; }
        .email-padding { padding-left: 24px !important; padding-right: 24px !important; }
        .email-heading { font-size: 30px !important; line-height: 36px !important; }
        .email-button { display: block !important; width: 100% !important; box-sizing: border-box !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f4f0e6;color:#20332b;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}&#847; &zwnj; &nbsp; &#847; &zwnj; &nbsp;</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f4f0e6;">
      <tr>
        <td align="center" style="padding:32px 12px;">
          <table role="presentation" class="email-shell" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:600px;border:1px solid #ded7c7;border-radius:18px;background:#fffdf8;overflow:hidden;">
            <tr>
              <td class="email-padding" style="padding:24px 40px;background:#173a2d;border-bottom:4px solid #c8a44d;">
                <p style="margin:0;color:#fffdf8;font-size:14px;line-height:20px;font-weight:700;letter-spacing:1.8px;">ESTATE SALES</p>
                <p style="margin:2px 0 0;color:#e8d596;font-size:12px;line-height:18px;font-weight:700;letter-spacing:1.4px;">BAKERSFIELD</p>
              </td>
            </tr>
            <tr>
              <td class="email-padding" style="padding:44px 40px 24px;">
                <p style="margin:0 0 10px;color:#987425;font-size:13px;line-height:20px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">Secure account link</p>
                <h1 class="email-heading" style="margin:0 0 18px;color:#173a2d;font-family:Georgia,'Times New Roman',serif;font-size:36px;line-height:42px;font-weight:700;">${heading}</h1>
                <p style="margin:0 0 12px;color:#20332b;font-size:16px;line-height:25px;">Hi ${safeName},</p>
                <p style="margin:0;color:#4f5d56;font-size:16px;line-height:25px;">${explanation}</p>
              </td>
            </tr>
            <tr>
              <td class="email-padding" style="padding:8px 40px 28px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="center" bgcolor="#173a2d" style="border-radius:10px;">
                      <a class="email-button" href="${safeUrl}" style="display:inline-block;min-width:220px;min-height:44px;box-sizing:border-box;padding:14px 26px;border:1px solid #173a2d;border-radius:10px;background:#173a2d;color:#ffffff;font-size:16px;line-height:20px;font-weight:700;text-align:center;text-decoration:none;">${action}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:18px 0 0;color:#6c756f;font-size:13px;line-height:20px;">This secure link expires in ${expiry} and can be used once.</p>
              </td>
            </tr>
            <tr>
              <td class="email-padding" style="padding:0 40px 32px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-radius:12px;background:#f6f1e4;">
                  <tr>
                    <td style="padding:18px 20px;">
                      <p style="margin:0 0 8px;color:#20332b;font-size:13px;line-height:19px;font-weight:700;">Button not working?</p>
                      <p style="margin:0 0 8px;color:#5c6761;font-size:13px;line-height:19px;">Copy and paste this secure URL into your browser:</p>
                      <p style="margin:0;overflow-wrap:anywhere;word-break:break-all;color:#173a2d;font-size:12px;line-height:18px;"><a href="${safeUrl}" style="color:#173a2d;text-decoration:underline;">${safeUrl}</a></p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="email-padding" style="padding:24px 40px;border-top:1px solid #e4dece;background:#fbf8f0;">
                <p style="margin:0;color:#66716b;font-size:12px;line-height:19px;">${securityNotice}</p>
              </td>
            </tr>
            <tr>
              <td class="email-padding" style="padding:22px 40px;background:#173a2d;">
                <p style="margin:0;color:#ffffff;font-size:12px;line-height:18px;font-weight:700;">Estate Sales Bakersfield</p>
                <p style="margin:3px 0 0;color:#d9c789;font-size:11px;line-height:17px;">Bakersfield, California</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  return { subject, text, html };
}

export class ResendEmailService implements EmailService {
  private readonly client: ResendClient;

  constructor(
    private readonly from: string,
    apiKey: string,
    client?: ResendClient,
    private readonly templateRenderer?: (
      message: AuthenticationEmailMessage,
    ) => Promise<{
      subject: string;
      html: string;
      text: string;
      templateRevisionId: string;
    } | null>,
  ) {
    this.client = client ?? new Resend(apiKey);
  }

  async send(message: AuthenticationEmailMessage): Promise<{
    readonly providerMessageId: string;
    readonly templateRevisionId?: string;
  }> {
    const managed = await this.templateRenderer?.(message);
    const content = managed ?? renderAuthenticationEmail(message);
    const result = await this.client.emails.send(
      {
        from: this.from,
        to: [message.to],
        ...content,
      },
      { idempotencyKey: message.idempotencyKey },
    );
    if (result.error || !result.data) {
      const code = result.error?.name ?? "RESEND_EMPTY_RESPONSE";
      logger.warn(
        { provider: "resend", code, kind: message.kind },
        "Transactional email provider rejected a message",
      );
      throw new EmailDeliveryError(code);
    }
    return {
      providerMessageId: result.data.id,
      ...(managed ? { templateRevisionId: managed.templateRevisionId } : {}),
    };
  }
}
