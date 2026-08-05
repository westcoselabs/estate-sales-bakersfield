import { parse } from "csv-parse/sync";

import { ListingImportValidationError } from "../domain/errors";
import {
  LISTING_IMPORT_CONTRACT_VERSION,
  type ListingImportEnvelope,
} from "../domain/types";

export const LISTING_IMPORT_CSV_HEADERS = [
  "contract_version",
  "source_key",
  "source_listing_id",
  "source_url",
  "retrieved_at",
  "ingestor_run_id",
  "ingestor_instance_id",
  "parser_version",
  "content_hash",
  "event_type",
  "title",
  "description",
  "local_starts_at",
  "local_ends_at",
  "timezone",
  "address_line_1",
  "address_line_2",
  "city",
  "region",
  "postal_code",
  "country_code",
  "privacy_mode",
] as const;

export type ListingImportCsvErrorCode =
  | "CSV_MALFORMED"
  | "CSV_HEADERS_INVALID"
  | "CSV_ROW_COUNT_INVALID"
  | "CSV_METADATA_INVALID"
  | "CSV_CONTRACT_VERSION_UNSUPPORTED";

const safeMessageByCode: Readonly<Record<ListingImportCsvErrorCode, string>> = {
  CSV_MALFORMED: "The CSV import payload is malformed.",
  CSV_HEADERS_INVALID: "The CSV import headers are invalid.",
  CSV_ROW_COUNT_INVALID: "The CSV import row count is invalid.",
  CSV_METADATA_INVALID: "The CSV import metadata is invalid.",
  CSV_CONTRACT_VERSION_UNSUPPORTED:
    "The CSV import contract version is unsupported.",
};

/**
 * A transport-safe validation error. Its message and enumerable fields never
 * include CSV records or parser diagnostics, which can contain listing data.
 */
export class ListingImportCsvError extends ListingImportValidationError {
  constructor(readonly csvCode: ListingImportCsvErrorCode) {
    super(
      csvCode === "CSV_CONTRACT_VERSION_UNSUPPORTED"
        ? "UNSUPPORTED_CONTRACT_VERSION"
        : "INVALID_ENVELOPE",
      safeMessageByCode[csvCode],
    );
  }
}

type ListingImportCsvRecord = readonly [
  contractVersion: string,
  sourceKey: string,
  sourceListingId: string,
  sourceUrl: string,
  retrievedAt: string,
  ingestorRunId: string,
  ingestorInstanceId: string,
  parserVersion: string,
  contentHash: string,
  eventType: string,
  title: string,
  description: string,
  localStartsAt: string,
  localEndsAt: string,
  timezone: string,
  addressLine1: string,
  addressLine2: string,
  city: string,
  region: string,
  postalCode: string,
  countryCode: string,
  privacyMode: string,
];

function hasExactHeaders(record: readonly string[]): boolean {
  return (
    record.length === LISTING_IMPORT_CSV_HEADERS.length &&
    record.every(
      (header, index) => header === LISTING_IMPORT_CSV_HEADERS[index],
    )
  );
}

function asFixedRecord(record: readonly string[]): ListingImportCsvRecord {
  if (record.length !== LISTING_IMPORT_CSV_HEADERS.length) {
    throw new ListingImportCsvError("CSV_MALFORMED");
  }
  return record as ListingImportCsvRecord;
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function optionalAddress(value: string): string | null {
  return value.length === 0 ? null : value;
}

function parseRecords(
  csvText: string,
  options: { readonly headerOnly?: boolean } = {},
): readonly (readonly string[])[] {
  if (typeof csvText !== "string" || csvText.includes("\u0000")) {
    throw new ListingImportCsvError("CSV_MALFORMED");
  }

  try {
    return parse(csvText, {
      bom: false,
      cast: false,
      columns: false,
      delimiter: ",",
      encoding: "utf8",
      escape: '"',
      max_record_size: 1_048_576,
      quote: '"',
      relax_column_count: false,
      relax_quotes: false,
      skip_empty_lines: false,
      skip_records_with_error: false,
      ...(options.headerOnly === true ? { to: 1 } : {}),
      trim: false,
    });
  } catch {
    throw new ListingImportCsvError("CSV_MALFORMED");
  }
}

/**
 * Converts the fixed listing-import.v1 CSV transport into the canonical JSON
 * envelope. Field validation and normalization remain the responsibility of
 * ListingImportService.
 */
export function parseListingImportCsv(csvText: string): ListingImportEnvelope {
  const header = parseRecords(csvText, { headerOnly: true })[0];
  if (header === undefined || !hasExactHeaders(header)) {
    throw new ListingImportCsvError("CSV_HEADERS_INVALID");
  }

  const records = parseRecords(csvText);
  const dataRecords = records.slice(1);
  if (dataRecords.length < 1 || dataRecords.length > 200) {
    throw new ListingImportCsvError("CSV_ROW_COUNT_INVALID");
  }

  const rows = dataRecords.map(asFixedRecord);
  const firstRow = rows[0];
  if (firstRow === undefined) {
    throw new ListingImportCsvError("CSV_ROW_COUNT_INVALID");
  }
  const [
    contractVersion,
    sourceKey,
    ,
    ,
    ,
    ingestorRunId,
    ingestorInstanceId,
    parserVersion,
  ] = firstRow;
  const envelopeMetadata = [
    contractVersion,
    sourceKey,
    ingestorRunId,
    ingestorInstanceId,
    parserVersion,
  ] as const;

  if (envelopeMetadata.some(isBlank)) {
    throw new ListingImportCsvError("CSV_METADATA_INVALID");
  }
  if (contractVersion !== LISTING_IMPORT_CONTRACT_VERSION) {
    throw new ListingImportCsvError("CSV_CONTRACT_VERSION_UNSUPPORTED");
  }

  for (const row of rows.slice(1)) {
    if (
      row[0] !== contractVersion ||
      row[1] !== sourceKey ||
      row[5] !== ingestorRunId ||
      row[6] !== ingestorInstanceId ||
      row[7] !== parserVersion
    ) {
      throw new ListingImportCsvError("CSV_METADATA_INVALID");
    }
  }

  return {
    contractVersion: LISTING_IMPORT_CONTRACT_VERSION,
    sourceKey,
    ingestorRunId,
    ingestorInstanceId,
    parserVersion,
    items: rows.map((row) => ({
      sourceListingId: row[2],
      sourceUrl: row[3],
      retrievedAt: row[4],
      contentHash: row[8],
      eventType: row[9],
      title: row[10],
      description: row[11],
      localStartsAt: row[12],
      localEndsAt: row[13],
      timezone: row[14],
      addressLine1: optionalAddress(row[15]),
      addressLine2: optionalAddress(row[16]),
      city: row[17],
      region: row[18],
      postalCode: row[19],
      countryCode: row[20],
      privacyMode: row[21],
    })),
  };
}
