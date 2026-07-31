import { createHash } from "node:crypto";

import sanitizeHtml from "sanitize-html";

import { EmailApplicationError } from "../domain/errors";
import type { CampaignListingSnapshot, RenderedEmail } from "../domain/types";

export const MAX_EMAIL_HTML_BYTES = 250 * 1024;

export function escapeEmailHtml(value: string): string {
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

export function sanitizeEmailHtml(value: string): string {
  if (Buffer.byteLength(value, "utf8") > MAX_EMAIL_HTML_BYTES) {
    throw new EmailApplicationError(
      "HTML_TOO_LARGE",
      "Email HTML must be 250 KB or smaller.",
      400,
    );
  }
  if (
    /<(script|iframe|frame|frameset|form|input|button|object|embed|link|base)\b/i.test(
      value,
    ) ||
    /<meta\b[^>]*http-equiv\s*=\s*["']?refresh/i.test(value) ||
    /\son[a-z]+\s*=/i.test(value) ||
    /(?:javascript|data\s*:\s*text\/html)\s*:/i.test(value) ||
    /@import\b|url\s*\(/i.test(value)
  ) {
    throw new EmailApplicationError(
      "UNSAFE_HTML",
      "Email HTML contains scripts, forms, unsafe links, external styles, or active content.",
      400,
    );
  }
  const cleaned = sanitizeHtml(value, {
    allowedTags: [
      "html",
      "head",
      "body",
      "title",
      "meta",
      "style",
      "table",
      "thead",
      "tbody",
      "tfoot",
      "tr",
      "td",
      "th",
      "div",
      "span",
      "p",
      "br",
      "hr",
      "h1",
      "h2",
      "h3",
      "h4",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "a",
      "img",
      "ul",
      "ol",
      "li",
      "blockquote",
      "small",
    ],
    allowedAttributes: {
      "*": [
        "class",
        "style",
        "role",
        "aria-label",
        "width",
        "height",
        "align",
        "valign",
        "bgcolor",
      ],
      html: ["lang"],
      meta: ["charset", "name", "content"],
      table: ["cellspacing", "cellpadding", "border"],
      a: ["href", "target", "rel", "title"],
      img: ["src", "alt", "title"],
    },
    allowedSchemes: ["https", "mailto", "tel", "cid"],
    allowedSchemesByTag: {
      img: ["https", "cid"],
      a: ["https", "mailto", "tel"],
    },
    allowVulnerableTags: true,
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    parser: { lowerCaseTags: true },
  }).trim();
  if (!cleaned) {
    throw new EmailApplicationError(
      "HTML_REQUIRED",
      "Email HTML is required.",
      400,
    );
  }
  return cleaned;
}

export function emailContentDigest(subject: string, html: string): string {
  return createHash("sha256")
    .update(subject)
    .update("\0")
    .update(html)
    .digest("hex");
}

export function assertRequiredVariables(
  html: string,
  required: readonly string[],
): void {
  const missing = required.filter(
    (variable) =>
      !html.includes(`{{${variable}}}`) && !html.includes(`{{{${variable}}}}`),
  );
  if (missing.length > 0) {
    throw new EmailApplicationError(
      "MISSING_TEMPLATE_VARIABLE",
      `Required variable missing: ${missing.join(", ")}.`,
      400,
    );
  }
}

export function renderEmailTemplate(input: {
  subject: string;
  html: string;
  values: Readonly<Record<string, string | number>>;
  trustedHtml?: Readonly<Record<string, string>>;
  text: string;
}): RenderedEmail {
  let subject = input.subject;
  let html = input.html;
  for (const [key, raw] of Object.entries(input.values)) {
    const value = String(raw);
    subject = subject.replaceAll(`{{${key}}}`, value.replace(/[\r\n]/g, " "));
    html = html.replaceAll(`{{${key}}}`, escapeEmailHtml(value));
  }
  for (const [key, value] of Object.entries(input.trustedHtml ?? {})) {
    html = html.replaceAll(`{{{${key}}}}`, value);
  }
  return { subject, html, text: input.text };
}

export function renderRecentListingsHtml(
  listings: readonly CampaignListingSnapshot[],
  applicationUrl: string,
): string {
  return listings
    .map((listing) => {
      const url = new URL(listing.path, applicationUrl).toString();
      const label =
        listing.type === "ESTATE_SALE" ? "Estate sale" : "Yard sale";
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 14px;border:1px solid #ded7c7;border-radius:12px;background:#fff"><tr><td style="padding:18px"><p style="margin:0 0 6px;color:#987425;font-size:12px;font-weight:700;text-transform:uppercase">${label}</p><h2 style="margin:0 0 8px;color:#173a2d;font-size:22px;line-height:28px">${escapeEmailHtml(listing.title)}</h2><p style="margin:0 0 14px;color:#5c6761;font-size:14px;line-height:21px">${escapeEmailHtml(listing.city)} · ${escapeEmailHtml(listing.startsAt)}</p><a href="${escapeEmailHtml(url)}" style="color:#173a2d;font-weight:700">View sale</a></td></tr></table>`;
    })
    .join("");
}

export function parseCampaignListingSnapshot(
  value: unknown,
): CampaignListingSnapshot[] {
  if (!Array.isArray(value)) {
    throw new EmailApplicationError(
      "INVALID_CAMPAIGN_SNAPSHOT",
      "The campaign listing snapshot is invalid.",
      409,
    );
  }
  const rows = value.filter((entry): entry is CampaignListingSnapshot =>
    Boolean(
      entry &&
      typeof entry === "object" &&
      "eventId" in entry &&
      typeof entry.eventId === "string" &&
      "title" in entry &&
      typeof entry.title === "string" &&
      "path" in entry &&
      typeof entry.path === "string" &&
      "startsAt" in entry &&
      typeof entry.startsAt === "string" &&
      "endsAt" in entry &&
      typeof entry.endsAt === "string" &&
      "city" in entry &&
      typeof entry.city === "string" &&
      "type" in entry &&
      ["ESTATE_SALE", "YARD_SALE"].includes(String(entry.type)),
    ),
  );
  if (rows.length !== value.length || rows.length < 1 || rows.length > 6) {
    throw new EmailApplicationError(
      "INVALID_CAMPAIGN_SNAPSHOT",
      "The campaign listing snapshot is invalid.",
      409,
    );
  }
  return rows;
}
