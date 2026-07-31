import { describe, expect, it } from "vitest";

import { encodeMarketingCsv } from "@/modules/admin/application/csv";

describe("marketing CSV encoding", () => {
  it("uses a UTF-8 BOM, CRLF, RFC 4180 quoting, and spreadsheet protection", () => {
    const bytes = encodeMarketingCsv([
      ["Name", "Email"],
      ['A "quoted", name', "person@example.test"],
      [" =2+2", "+SUM(A1:A2)"],
      ["line\nbreak", "@command"],
    ]);
    const text = new TextDecoder().decode(bytes);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(text).toContain('"A ""quoted"", name"');
    expect(text).toContain(`"' =2+2","'+SUM(A1:A2)"`);
    expect(text).toContain(`"'@command"`);
    expect(text.endsWith("\r\n")).toBe(true);
  });
});
