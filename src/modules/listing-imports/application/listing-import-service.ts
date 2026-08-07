import {
  ListingImportRowError,
  ListingImportValidationError,
} from "../domain/errors";
import {
  assertListingImportTimezone,
  canonicalizeSourceUrl,
  normalizeComparableText,
  normalizedFullAddress,
  normalizeListingContent,
} from "../domain/normalization";
import {
  LISTING_IMPORT_CONTRACT_VERSION,
  LISTING_IMPORT_RESULT_VERSION,
  type ListingImportEnvelope,
  type ListingImportResult,
  type ListingImportValidationCode,
  type NormalizedListingImportItem,
} from "../domain/types";
import { listingContentHash, stableJsonDigest } from "./content-hash";
import type {
  ListingImportCommandContext,
  ListingImportJsonObject,
  ListingImportJsonValue,
  ListingImportRepository,
  ListingImportSourceConfiguration,
  PreparedListingImportRow,
  ValidPreparedListingImportRow,
} from "./ports";
import {
  itemValidationCodes,
  listingImportEnvelopeSchema,
  listingImportItemSchema,
  type ListingImportItemInput,
} from "./schemas";

const SHA_256_DIGEST = /^[0-9a-f]{64}$/u;
const MAXIMUM_OBSERVATION_STRING_LENGTH = 6_000;
const MAXIMUM_OBSERVATION_VALUE_BYTES = 8 * 1_024;
const MAXIMUM_OBSERVATION_SERIALIZED_BYTES = 12 * 1_024;
const MAXIMUM_OBSERVATION_NODES = 512;
const MAXIMUM_INPUT_NODES = 1_000;
const MAXIMUM_INPUT_DEPTH = 8;
const MAXIMUM_LISTING_DURATION_MILLISECONDS = 14 * 24 * 60 * 60 * 1_000;
const ITEM_FIELDS = [
  "sourceListingId",
  "sourceUrl",
  "retrievedAt",
  "contentHash",
  "eventType",
  "title",
  "description",
  "localStartsAt",
  "localEndsAt",
  "timezone",
  "addressLine1",
  "addressLine2",
  "city",
  "region",
  "postalCode",
  "countryCode",
  "privacyMode",
] as const;

interface ObservationBudget {
  remainingBytes: number;
  remainingNodes: number;
}

function jsonStringBytes(value: string): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8") - 2;
}

function truncateJsonString(value: string, maximumBytes: number): string {
  const maximumLength = Math.min(
    value.length,
    MAXIMUM_OBSERVATION_STRING_LENGTH,
  );
  let low = 0;
  let high = maximumLength;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = value.slice(0, middle);
    if (jsonStringBytes(candidate) <= maximumBytes) low = middle;
    else high = middle - 1;
  }
  // Do not retain half of a UTF-16 surrogate pair at the byte boundary.
  const codeUnit = value.charCodeAt(low - 1);
  const safeLength = codeUnit >= 0xd800 && codeUnit <= 0xdbff ? low - 1 : low;
  return value.slice(0, Math.max(0, safeLength));
}

function boundedJsonScalar(
  value: unknown,
  budget: ObservationBudget,
  depth = 0,
): ListingImportJsonValue {
  if (budget.remainingNodes <= 0) return "[truncated]";
  budget.remainingNodes -= 1;
  if (value === null) return null;
  if (typeof value === "string") {
    const result = truncateJsonString(value, budget.remainingBytes);
    budget.remainingBytes -= jsonStringBytes(result);
    return result;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    if (depth >= 2) return "[nested-array]";
    const result: ListingImportJsonValue[] = [];
    for (const entry of value.slice(0, 50)) {
      if (budget.remainingNodes <= 0) {
        result.push("[truncated]");
        break;
      }
      result.push(boundedJsonScalar(entry, budget, depth + 1));
    }
    return result;
  }
  if (typeof value === "object") return "[unsupported-object]";
  return `[${typeof value}]`;
}

export function boundedListingImportInput(
  value: unknown,
): ListingImportJsonValue {
  const budget: ObservationBudget = {
    remainingBytes: MAXIMUM_OBSERVATION_VALUE_BYTES,
    remainingNodes: MAXIMUM_OBSERVATION_NODES,
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return boundedJsonScalar(value, budget);
  }

  const input = value as Readonly<Record<string, unknown>>;
  const output: Record<string, ListingImportJsonValue> = {};
  for (const field of ITEM_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      output[field] = boundedJsonScalar(input[field], budget);
    }
  }
  if (
    Buffer.byteLength(JSON.stringify(output), "utf8") >
    MAXIMUM_OBSERVATION_SERIALIZED_BYTES
  ) {
    const fitted: Record<string, ListingImportJsonValue> = {};
    for (const field of ITEM_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(output, field)) continue;
      fitted[field] = output[field]!;
      if (
        Buffer.byteLength(JSON.stringify(fitted), "utf8") >
        MAXIMUM_OBSERVATION_SERIALIZED_BYTES
      ) {
        delete fitted[field];
        break;
      }
    }
    return fitted;
  }
  return output;
}

function inputExceedsStructuralLimits(value: unknown): boolean {
  const stack: { readonly value: unknown; readonly depth: number }[] = [
    { value, depth: 0 },
  ];
  const seen = new Set<object>();
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop()!;
    nodes += 1;
    if (nodes > MAXIMUM_INPUT_NODES || current.depth > MAXIMUM_INPUT_DEPTH) {
      return true;
    }
    if (!current.value || typeof current.value !== "object") continue;
    if (seen.has(current.value)) return true;
    seen.add(current.value);
    const entries = Array.isArray(current.value)
      ? current.value
      : Object.values(current.value as Readonly<Record<string, unknown>>);
    for (const entry of entries) {
      stack.push({ value: entry, depth: current.depth + 1 });
    }
  }
  return false;
}

function normalizedJson(
  item: NormalizedListingImportItem,
): ListingImportJsonObject {
  return {
    sourceListingId: item.sourceListingId,
    sourceUrl: item.canonicalSourceUrl,
    retrievedAt: item.retrievedAt.toISOString(),
    contentHash: item.contentHash,
    eventType: item.eventType,
    title: item.title,
    description: item.description,
    localStartsAt: item.localStartsAt,
    localEndsAt: item.localEndsAt,
    startsAt: item.startsAt.toISOString(),
    endsAt: item.endsAt.toISOString(),
    timezone: item.timezone,
    addressLine1: item.addressLine1,
    addressLine2: item.addressLine2,
    city: item.city,
    region: item.region,
    postalCode: item.postalCode,
    countryCode: item.countryCode,
    privacyMode: item.privacyMode,
    normalizedTitle: item.normalizedTitle,
    normalizedAddress: item.normalizedAddress,
    normalizedCity: item.normalizedCity,
    normalizedPostalCode: item.normalizedPostalCode,
  };
}

function invalidRow(
  rowNumber: number,
  raw: unknown,
  codes: readonly ListingImportValidationCode[],
): PreparedListingImportRow {
  return {
    status: "INVALID",
    rowNumber,
    inputJson: boundedListingImportInput(raw),
    validationCodes: [...new Set(codes)],
  };
}

function normalizeValidItem(
  parsed: ListingImportItemInput,
  canonicalSourceUrl: string,
  normalized: ReturnType<typeof normalizeListingContent>,
): NormalizedListingImportItem {
  return {
    ...normalized,
    sourceListingId: parsed.sourceListingId,
    canonicalSourceUrl,
    retrievedAt: new Date(parsed.retrievedAt),
    contentHash: parsed.contentHash,
    normalizedTitle: normalizeComparableText(normalized.title),
    normalizedAddress: normalizedFullAddress(normalized),
    normalizedCity: normalizeComparableText(normalized.city),
    normalizedPostalCode: normalizeComparableText(normalized.postalCode),
  };
}

function prepareRow(
  raw: unknown,
  rowNumber: number,
  source: ListingImportSourceConfiguration,
): PreparedListingImportRow {
  if (inputExceedsStructuralLimits(raw)) {
    return invalidRow(rowNumber, raw, ["ITEM_INVALID"]);
  }
  const parsed = listingImportItemSchema.safeParse(raw);
  if (!parsed.success) {
    return invalidRow(rowNumber, raw, itemValidationCodes(parsed.error));
  }

  const codes: ListingImportValidationCode[] = [];
  let canonicalSourceUrl: string | null = null;
  try {
    canonicalSourceUrl = canonicalizeSourceUrl(parsed.data.sourceUrl, source);
  } catch (error) {
    codes.push(
      error instanceof ListingImportRowError
        ? error.code
        : "SOURCE_URL_INVALID",
    );
  }

  let normalized: ReturnType<typeof normalizeListingContent> | null = null;
  try {
    assertListingImportTimezone(parsed.data.timezone);
    normalized = normalizeListingContent(parsed.data);
    if (
      normalized.endsAt.getTime() - normalized.startsAt.getTime() >
      MAXIMUM_LISTING_DURATION_MILLISECONDS
    ) {
      throw new ListingImportRowError("SCHEDULE_INVALID");
    }
  } catch (error) {
    codes.push(
      error instanceof ListingImportRowError ? error.code : "SCHEDULE_INVALID",
    );
  }

  if (
    normalized &&
    listingContentHash(normalized) !== parsed.data.contentHash
  ) {
    codes.push("CONTENT_HASH_MISMATCH");
  }
  const item =
    canonicalSourceUrl && normalized
      ? normalizeValidItem(parsed.data, canonicalSourceUrl, normalized)
      : null;
  if (codes.length > 0 || !item) {
    return invalidRow(
      rowNumber,
      raw,
      codes.length > 0 ? codes : ["ITEM_INVALID"],
    );
  }

  return {
    status: "VALID",
    rowNumber,
    inputJson: boundedListingImportInput(raw) as ListingImportJsonObject,
    normalizedJson: normalizedJson(item),
    item,
  } satisfies ValidPreparedListingImportRow;
}

function parseEnvelope(input: unknown): ListingImportEnvelope {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const contractVersion = (input as Readonly<Record<string, unknown>>)
      .contractVersion;
    if (
      typeof contractVersion === "string" &&
      contractVersion !== LISTING_IMPORT_CONTRACT_VERSION
    ) {
      throw new ListingImportValidationError(
        "UNSUPPORTED_CONTRACT_VERSION",
        "The listing import contract version is not supported.",
      );
    }
  }

  const result = listingImportEnvelopeSchema.safeParse(input);
  if (!result.success) {
    throw new ListingImportValidationError(
      "INVALID_ENVELOPE",
      "The listing import envelope is invalid.",
    );
  }
  return result.data;
}

function validateCommandContext(context: ListingImportCommandContext): void {
  const matchingActor =
    (context.transport === "API" && context.actor.kind === "API_CREDENTIAL") ||
    (context.transport !== "API" && context.actor.kind === "ADMIN_USER");
  if (!matchingActor) {
    throw new ListingImportValidationError(
      "ACTOR_TRANSPORT_MISMATCH",
      "The import actor is not valid for this transport.",
    );
  }
  if (
    context.actor.kind === "API_CREDENTIAL" &&
    (!context.actor.credentialId ||
      !SHA_256_DIGEST.test(context.actor.idempotencyKeyDigest))
  ) {
    throw new ListingImportValidationError(
      "INVALID_DIGEST",
      "The ingestion request digest is invalid.",
    );
  }
  if (
    context.requestDigest !== undefined &&
    !SHA_256_DIGEST.test(context.requestDigest)
  ) {
    throw new ListingImportValidationError(
      "INVALID_DIGEST",
      "The ingestion request digest is invalid.",
    );
  }
}

export class ListingImportService {
  constructor(
    private readonly imports: ListingImportRepository,
    private readonly environment:
      "local" | "test" | "preview" | "production" = "local",
  ) {}

  async importBatch(
    input: unknown,
    context: ListingImportCommandContext,
  ): Promise<ListingImportResult> {
    validateCommandContext(context);
    const envelope = parseEnvelope(input);
    const source = await this.imports.findSourceByKey(envelope.sourceKey);
    if (!source) {
      throw new ListingImportValidationError(
        "SOURCE_NOT_FOUND",
        "The listing import source is unavailable.",
      );
    }
    if (!source.enabled) {
      throw new ListingImportValidationError(
        "SOURCE_DISABLED",
        "The listing import source is unavailable.",
      );
    }
    if (this.environment === "production" && !source.productionAllowed) {
      throw new ListingImportValidationError(
        "SOURCE_NOT_PRODUCTION_ALLOWED",
        "The listing import source is unavailable in production.",
      );
    }

    const rows = envelope.items.map((item, index) =>
      prepareRow(item, index + 1, source),
    );
    const payloadDigest = stableJsonDigest({
      contractVersion: envelope.contractVersion,
      sourceKey: envelope.sourceKey,
      ingestorRunId: envelope.ingestorRunId,
      ingestorInstanceId: envelope.ingestorInstanceId,
      parserVersion: envelope.parserVersion,
      rows: rows.map((row, index) =>
        row.status === "VALID"
          ? { rowNumber: row.rowNumber, normalized: row.normalizedJson }
          : {
              rowNumber: row.rowNumber,
              input: envelope.items[index],
              validationCodes: row.validationCodes,
            },
      ),
    });
    const result = await this.imports.processBatchAtomically({
      sourceId: source.id,
      sourceKey: source.key,
      sourcePolicy: {
        allowedHosts: source.allowedHosts,
        allowedQueryParameters: source.allowedQueryParameters,
      },
      requireProductionAllowed: this.environment === "production",
      transport: context.transport,
      actor: context.actor,
      contractVersion: envelope.contractVersion,
      parserVersion: envelope.parserVersion,
      ingestorRunId: envelope.ingestorRunId,
      ingestorInstanceId: envelope.ingestorInstanceId,
      requestDigest: context.requestDigest ?? payloadDigest,
      payloadDigest,
      rows,
      audit: context.audit ?? {},
    });

    return {
      contractVersion: LISTING_IMPORT_RESULT_VERSION,
      batchId: result.batchId,
      replayed: result.replayed,
      status: result.status,
      counts: result.counts,
      rows: result.rows,
    };
  }
}
