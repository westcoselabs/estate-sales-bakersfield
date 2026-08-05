import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  LISTING_IMPORT_CSV_HEADERS,
  ListingImportCsvError,
  parseListingImportCsv,
} from "@/modules/listing-imports/infrastructure/csv-listing-import-adapter";

const fixtureRoot = resolve("tests/fixtures/listing-import/v1");
const validCsv = readFileSync(
  resolve(fixtureRoot, "valid-request.csv"),
  "utf8",
);
const validJson = JSON.parse(
  readFileSync(resolve(fixtureRoot, "valid-request.json"), "utf8"),
) as unknown;
const validDataRow = validCsv.trimEnd().split("\n")[1];
if (validDataRow === undefined) {
  throw new Error("The valid CSV fixture must contain one data row.");
}

function expectCsvError(
  action: () => unknown,
  csvCode: ListingImportCsvError["csvCode"],
): void {
  try {
    action();
    throw new Error("Expected CSV parsing to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(ListingImportCsvError);
    expect(error).toMatchObject({ csvCode });
  }
}

describe("listing import CSV adapter", () => {
  it("converts the committed CSV fixture into the field-equivalent v1 JSON envelope", () => {
    expect(parseListingImportCsv(validCsv)).toEqual(validJson);
  });

  it("maps empty optional address fields to null without normalizing other fields", () => {
    const parsed = parseListingImportCsv(validCsv);
    expect(parsed.items[0]).toMatchObject({
      addressLine1: "101 Example Avenue",
      addressLine2: null,
    });
  });

  it.each([
    {
      label: "duplicate",
      headers: LISTING_IMPORT_CSV_HEADERS.with(
        1,
        LISTING_IMPORT_CSV_HEADERS[0],
      ),
    },
    {
      label: "missing",
      headers: LISTING_IMPORT_CSV_HEADERS.slice(0, -1),
    },
    {
      label: "extra",
      headers: [...LISTING_IMPORT_CSV_HEADERS, "unexpected"],
    },
    {
      label: "misspelled",
      headers: [...LISTING_IMPORT_CSV_HEADERS].map((header, index) =>
        index === 0 ? "contractVersion" : header,
      ),
    },
  ])("rejects $label headers", ({ headers }) => {
    expectCsvError(
      () => parseListingImportCsv(`${headers.join(",")}\n${validDataRow}`),
      "CSV_HEADERS_INVALID",
    );
  });

  it("rejects malformed CSV without reflecting parser input in the safe error", () => {
    const secret = "private-row-value";
    try {
      parseListingImportCsv(
        `${LISTING_IMPORT_CSV_HEADERS.join(",")}\n"${secret}`,
      );
      throw new Error("Expected CSV parsing to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(ListingImportCsvError);
      expect(error).toMatchObject({ csvCode: "CSV_MALFORMED" });
      expect(String(error)).not.toContain(secret);
      expect(JSON.stringify(error)).not.toContain(secret);
    }
  });

  it("rejects blank or mismatched envelope metadata across rows", () => {
    const columns = validDataRow.split(",");
    const blankMetadata = columns.with(1, "   ").join(",");
    expectCsvError(
      () =>
        parseListingImportCsv(
          `${LISTING_IMPORT_CSV_HEADERS.join(",")}\n${blankMetadata}`,
        ),
      "CSV_METADATA_INVALID",
    );

    const mismatchedMetadata = columns
      .with(7, "fixture-parser@2.0.0")
      .join(",");
    expectCsvError(
      () =>
        parseListingImportCsv(`${validCsv.trimEnd()}\n${mismatchedMetadata}\n`),
      "CSV_METADATA_INVALID",
    );
  });

  it("rejects unsupported contract versions before reaching the service", () => {
    const columns = validDataRow.split(",");
    const unsupported = columns.with(0, "listing-import.v2").join(",");
    expectCsvError(
      () =>
        parseListingImportCsv(
          `${LISTING_IMPORT_CSV_HEADERS.join(",")}\n${unsupported}`,
        ),
      "CSV_CONTRACT_VERSION_UNSUPPORTED",
    );
  });

  it("requires between one and 200 data rows", () => {
    expectCsvError(
      () => parseListingImportCsv(`${LISTING_IMPORT_CSV_HEADERS.join(",")}\n`),
      "CSV_ROW_COUNT_INVALID",
    );

    const tooManyRows = Array.from({ length: 201 }, () => validDataRow).join(
      "\n",
    );
    expectCsvError(
      () =>
        parseListingImportCsv(
          `${LISTING_IMPORT_CSV_HEADERS.join(",")}\n${tooManyRows}`,
        ),
      "CSV_ROW_COUNT_INVALID",
    );
  });

  it("rejects inconsistent row widths and NUL-containing input as malformed", () => {
    expectCsvError(
      () => parseListingImportCsv(`${validCsv.trimEnd()},unexpected`),
      "CSV_MALFORMED",
    );
    expectCsvError(
      () => parseListingImportCsv(`${validCsv}\u0000`),
      "CSV_MALFORMED",
    );
  });
});
