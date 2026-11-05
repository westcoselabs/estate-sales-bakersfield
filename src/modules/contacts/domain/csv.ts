import { parse } from "csv-parse/sync";
import { z } from "zod";

export const contactCategories = ["ATTENDEE", "BUSINESS_OWNER"] as const;
export const contactStatuses = [
  "SUBSCRIBED",
  "UNSUBSCRIBED",
  "CLEANED",
] as const;
export type ContactStatus = (typeof contactStatuses)[number];
const singleLine = (value: string) =>
  ![...value].some(
    (character) =>
      character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
  );
export const importInput = z.object({
  csv: z.string().min(1).max(500_000),
  category: z.enum(contactCategories),
  sourceTag: z.string().trim().min(1).max(80).refine(singleLine),
  defaultStatus: z.enum(contactStatuses).optional(),
  consentConfirmed: z.boolean(),
});
export type ContactImportInput = z.infer<typeof importInput>;
export interface ParsedContact {
  email: string;
  firstName: string;
  lastName: string;
  status: ContactStatus;
}
const priority = { SUBSCRIBED: 0, UNSUBSCRIBED: 1, CLEANED: 2 };
export function strongestStatus(
  a: ContactStatus,
  b: ContactStatus,
): ContactStatus {
  return priority[a] >= priority[b] ? a : b;
}

/** Never infer permission from an email address or an absent status column. */
export function parseContacts(input: ContactImportInput) {
  let records: Record<string, string>[];
  try {
    records = parse(input.csv, {
      bom: true,
      columns: (headers: string[]) => {
        const names = headers.map((header) =>
          header.trim().toLowerCase().replaceAll(" ", "_"),
        );
        if (new Set(names).size !== names.length)
          throw new Error("Duplicate headers");
        return names;
      },
      skip_empty_lines: true,
      trim: true,
      max_record_size: 20_000,
    }) as Record<string, string>[];
  } catch {
    throw new Error(
      "The CSV could not be read. Check its headers, quotes, and row lengths.",
    );
  }
  if (!records.length || records.length > 5_000)
    throw new Error("Upload between 1 and 5,000 CSV rows.");
  const unique = new Map<string, ParsedContact>();
  const invalid: { row: number; reason: string }[] = [];
  let duplicates = 0;
  records.forEach((record, index) => {
    const email = (record.email ?? record.email_address ?? "")
      .trim()
      .toLowerCase();
    const firstName = (record.first_name ?? "").trim();
    const lastName = (record.last_name ?? "").trim();
    const explicit = (record.source_status ?? record.status ?? "")
      .trim()
      .toUpperCase();
    const optOut = (record.unsubscribed ?? "").trim().toLowerCase();
    let status = contactStatuses.find((value) => value === explicit);
    // A positive opt-out flag overrides any claimed subscription.
    if (["true", "1", "yes"].includes(optOut))
      status = strongestStatus(status ?? "UNSUBSCRIBED", "UNSUBSCRIBED");
    if (!explicit && !status) status = input.defaultStatus;
    let reason = "";
    if (!z.email().max(320).safeParse(email).success)
      reason = "Invalid email address";
    else if (firstName.length > 120 || lastName.length > 120)
      reason = "Name exceeds 120 characters";
    else if (!singleLine(firstName) || !singleLine(lastName))
      reason = "Name contains unsupported control characters";
    else if (
      !status ||
      (explicit && !contactStatuses.includes(explicit as ContactStatus))
    )
      reason = "Missing or unknown subscription status";
    else if (
      optOut &&
      !["true", "1", "yes", "false", "0", "no"].includes(optOut)
    )
      reason = "Unknown unsubscribe flag";
    if (reason || !status) {
      invalid.push({ row: index + 2, reason });
      return;
    }
    const previous = unique.get(email);
    if (previous) duplicates++;
    unique.set(email, {
      email,
      firstName: previous?.firstName || firstName,
      lastName: previous?.lastName || lastName,
      status: previous ? strongestStatus(previous.status, status) : status,
    });
  });
  const rows = [...unique.values()].sort((a, b) =>
    a.email.localeCompare(b.email),
  );
  const counts = { SUBSCRIBED: 0, UNSUBSCRIBED: 0, CLEANED: 0 };
  for (const row of rows) counts[row.status]++;
  return { rows, counts, invalid, duplicates, sourceRows: records.length };
}

/** Quote every field and neutralize spreadsheet formula interpretation. */
export function csvCell(value: string) {
  const safe = /^[\s]*[=+\-@\t\r\n]/u.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
