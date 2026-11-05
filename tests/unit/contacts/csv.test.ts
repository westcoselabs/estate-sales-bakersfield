import { describe, expect, it } from "vitest";
import {
  csvCell,
  importInput,
  parseContacts,
} from "@/modules/contacts/domain/csv";

const input = (csv: string) =>
  importInput.parse({
    csv,
    category: "ATTENDEE",
    sourceTag: "Simply Decorated",
    consentConfirmed: true,
  });

describe("contact CSV imports", () => {
  it("rejects control characters before database writes", () => {
    expect(
      parseContacts(
        input("email,first_name,status\na@example.com,Ja\u0000ne,SUBSCRIBED"),
      ).invalid,
    ).toHaveLength(1);
    expect(() =>
      importInput.parse({
        ...input("email,status\na@example.com,SUBSCRIBED"),
        sourceTag: "Partner\u0000",
      }),
    ).toThrow();
  });
  it("handles Mailchimp headers, BOM and quoted names without inventing consent", () => {
    const parsed = parseContacts({
      ...input(
        '\uFEFFEmail Address,First Name,Last Name\r\nPerson@Example.com,"Jane, A.",Doe',
      ),
      defaultStatus: "SUBSCRIBED",
    });
    expect(parsed.rows[0]).toEqual({
      email: "person@example.com",
      firstName: "Jane, A.",
      lastName: "Doe",
      status: "SUBSCRIBED",
    });
    expect(
      parseContacts(input("email\na@example.com")).invalid[0]?.reason,
    ).toMatch(/status/);
  });
  it("deduplicates normalized addresses using the strongest suppression", () => {
    const parsed = parseContacts(
      input(
        "email,status\nA@example.com,SUBSCRIBED\na@example.com,UNSUBSCRIBED\na@example.com,CLEANED\na@example.com,SUBSCRIBED",
      ),
    );
    expect(parsed.duplicates).toBe(3);
    expect(parsed.rows[0]?.status).toBe("CLEANED");
  });
  it("never treats a positive opt-out flag as subscribed", () => {
    expect(
      parseContacts(
        input("email,status,unsubscribed\na@example.com,SUBSCRIBED,true"),
      ).rows[0]?.status,
    ).toBe("UNSUBSCRIBED");
  });
  it("reports invalid addresses and unknown statuses without importing them", () => {
    const parsed = parseContacts(
      input(
        "email,status\nbad,SUBSCRIBED\na@example.com,pending\nb@example.com,SUBSCRIBED",
      ),
    );
    expect(parsed.invalid.map((row) => row.row)).toEqual([2, 3]);
    expect(parsed.rows).toHaveLength(1);
  });
  it("rejects malformed CSV and duplicate headers", () => {
    expect(() => parseContacts(input('email,status\n"broken'))).toThrow(/CSV/);
    expect(() =>
      parseContacts(input("email,email\na@example.com,b@example.com")),
    ).toThrow(/CSV/);
  });
  it("neutralizes spreadsheet formulas and escapes embedded quotes", () => {
    expect(csvCell('=HYPERLINK("bad")')).toBe('"\'=HYPERLINK(""bad"")"');
    expect(csvCell("  +cmd")).toBe('"\'  +cmd"');
    expect(csvCell("Jane, Doe")).toBe('"Jane, Doe"');
  });
});
