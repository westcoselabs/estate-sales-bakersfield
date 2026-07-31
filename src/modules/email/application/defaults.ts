import type { EmailTemplateKey } from "../domain/types";

const shell = (
  heading: string,
  body: string,
  footer: string,
) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${heading}</title>
  <style>
    @media only screen and (max-width:620px){.email-shell{width:100%!important}.email-pad{padding-left:24px!important;padding-right:24px!important}.email-button{display:block!important;width:100%!important;box-sizing:border-box!important}}
  </style>
</head>
<body style="margin:0;padding:0;background:#f4f0e6;color:#20332b;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f4f0e6">
    <tr><td align="center" style="padding:32px 12px">
      <table role="presentation" class="email-shell" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:600px;border:1px solid #ded7c7;border-radius:18px;background:#fffdf8;overflow:hidden">
        <tr><td class="email-pad" style="padding:24px 40px;background:#173a2d;border-bottom:4px solid #c8a44d"><p style="margin:0;color:#fffdf8;font-size:14px;line-height:20px;font-weight:700;letter-spacing:1.8px">ESTATE SALES</p><p style="margin:2px 0 0;color:#e8d596;font-size:12px;line-height:18px;font-weight:700;letter-spacing:1.4px">BAKERSFIELD</p></td></tr>
        <tr><td class="email-pad" style="padding:42px 40px 32px"><h1 style="margin:0 0 18px;color:#173a2d;font-family:Georgia,'Times New Roman',serif;font-size:36px;line-height:42px">${heading}</h1>${body}</td></tr>
        <tr><td class="email-pad" style="padding:22px 40px;background:#173a2d"><p style="margin:0;color:#fff;font-size:12px;line-height:18px;font-weight:700">Estate Sales Bakersfield</p><p style="margin:3px 0 0;color:#d9c789;font-size:11px;line-height:17px">${footer}</p></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const actionBody = (
  copy: string,
  label: string,
) => `<p style="margin:0 0 12px;font-size:16px;line-height:25px">Hi {{DISPLAY_NAME}},</p>
<p style="margin:0 0 24px;color:#4f5d56;font-size:16px;line-height:25px">${copy}</p>
<p style="margin:0 0 22px"><a class="email-button" href="{{ACTION_URL}}" style="display:inline-block;min-width:220px;padding:14px 26px;border-radius:10px;background:#173a2d;color:#fff;font-size:16px;font-weight:700;text-align:center;text-decoration:none">${label}</a></p>
<p style="margin:0;color:#6c756f;font-size:13px;line-height:20px">This secure link expires in {{EXPIRY}} and can be used once.</p>`;

export const SYSTEM_EMAIL_DEFAULTS: Readonly<
  Record<
    EmailTemplateKey,
    {
      name: string;
      category: "TRANSACTIONAL" | "MARKETING";
      subject: string;
      html: string;
      requiredVariables: readonly string[];
    }
  >
> = {
  EMAIL_VERIFICATION: {
    name: "Verify email",
    category: "TRANSACTIONAL",
    subject: "Verify your Estate Sales Bakersfield email",
    html: shell(
      "Verify your email",
      actionBody(
        "Confirm your email address to approve your event, continue to payment, and publish your listing.",
        "Verify email",
      ),
      "If you did not create this account, you can ignore this email.",
    ),
    requiredVariables: ["DISPLAY_NAME", "ACTION_URL", "EXPIRY"],
  },
  PASSWORD_RESET: {
    name: "Reset password",
    category: "TRANSACTIONAL",
    subject: "Reset your Estate Sales Bakersfield password",
    html: shell(
      "Reset your password",
      actionBody(
        "We received a request to reset your password. Use the secure button below to choose a new one.",
        "Reset password",
      ),
      "If you did not request a password reset, your password will not change.",
    ),
    requiredVariables: ["DISPLAY_NAME", "ACTION_URL", "EXPIRY"],
  },
  PURCHASE_RECEIPT: {
    name: "Purchase receipt",
    category: "TRANSACTIONAL",
    subject: "Your Estate Sales Bakersfield payment receipt",
    html: shell(
      "Payment received",
      `<p style="margin:0 0 12px;font-size:16px;line-height:25px">Hi {{DISPLAY_NAME}},</p>
<p style="margin:0 0 22px;color:#4f5d56;font-size:16px;line-height:25px">We received your payment for <strong>{{EVENT_TITLE}}</strong>.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 22px;background:#f6f1e4;border-radius:12px"><tr><td style="padding:18px 20px"><p style="margin:0 0 8px"><strong>Amount:</strong> {{AMOUNT}} {{CURRENCY}}</p><p style="margin:0 0 8px"><strong>Paid:</strong> {{PAID_AT}}</p><p style="margin:0"><strong>Reference:</strong> {{PAYMENT_REFERENCE}}</p></td></tr></table>
<p style="margin:0 0 18px;color:#4f5d56;font-size:15px;line-height:23px">{{LISTING_STATUS}}</p>
<p style="margin:0"><a href="{{LISTING_URL}}" style="color:#173a2d;font-weight:700">View listing status</a></p>`,
      "Keep this email for your records.",
    ),
    requiredVariables: [
      "DISPLAY_NAME",
      "EVENT_TITLE",
      "AMOUNT",
      "CURRENCY",
      "PAID_AT",
      "PAYMENT_REFERENCE",
      "LISTING_STATUS",
      "LISTING_URL",
    ],
  },
  RECENT_LISTINGS: {
    name: "Recent listings",
    category: "MARKETING",
    subject: "Recently listed estate sales in Bakersfield",
    html: shell(
      "Fresh finds near Bakersfield",
      `<p style="margin:0 0 22px;font-size:16px;line-height:25px">Hi {{{contact.first_name|there}}}, these recently published sales are ready to explore.</p>
{{{RECENT_LISTINGS_HTML}}}
<p style="margin:26px 0 0;color:#66716b;font-size:12px;line-height:19px">You are receiving local sale updates from Estate Sales Bakersfield. <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#173a2d">Unsubscribe</a>.</p>`,
      "Discover local estate and yard sales.",
    ),
    requiredVariables: ["RECENT_LISTINGS_HTML", "RESEND_UNSUBSCRIBE_URL"],
  },
};
