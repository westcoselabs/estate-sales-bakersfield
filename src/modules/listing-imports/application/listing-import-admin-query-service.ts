import { z } from "zod";

import { requireSuperAdminPrincipal, type AuthPrincipal } from "@/modules/auth";

import type { ListingImportAuditAction } from "./audit";
import { encodeListingImportAdminCursor } from "./admin-criteria";
import type {
  ListingImportAdminAuditEntry,
  ListingImportAdminCandidateDetail,
  ListingImportAdminCandidatePayload,
  ListingImportAdminExternalListingDetail,
  ListingImportAdminJsonValue,
  ListingImportAdminLandingQuery,
  ListingImportAdminLandingResult,
  ListingImportAdminQueryRepository,
  ListingImportAdminRepositoryLandingPage,
} from "./admin-query-ports";

const localDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u;

const candidatePayloadSchema = z
  .object({
    eventType: z.enum(["ESTATE_SALE", "YARD_SALE"]),
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(20).max(5000),
    localStartsAt: z.string().regex(localDateTime),
    localEndsAt: z.string().regex(localDateTime),
    timezone: z.string().trim().min(1).max(64),
    addressLine1: z.string().trim().min(3).max(200).nullable(),
    addressLine2: z.string().trim().min(1).max(100).nullable(),
    city: z.string().trim().min(2).max(100),
    region: z.string().trim().min(2).max(100),
    postalCode: z.string().trim().min(1).max(20),
    countryCode: z.string().regex(/^[A-Z]{2}$/u),
    privacyMode: z.enum(["APPROXIMATE_LOCATION", "EXACT_ADDRESS"]),
  })
  .strip();

const SAFE_AUDIT_ACTIONS = new Set<ListingImportAuditAction>([
  "LISTING_IMPORT_BATCH_CREATED",
  "LISTING_IMPORT_CANDIDATE_CREATED",
  "LISTING_IMPORT_CANDIDATE_UPDATED",
  "LISTING_IMPORT_CANDIDATE_APPROVED",
  "LISTING_IMPORT_CANDIDATE_REJECTED",
  "LISTING_IMPORT_CANDIDATE_DELETED",
  "LISTING_IMPORT_DUPLICATE_RESOLVED",
  "LISTING_INGESTION_CREDENTIAL_CREATED",
  "LISTING_INGESTION_CREDENTIAL_REVOKED",
  "EXTERNAL_LISTING_EDITED",
  "EXTERNAL_LISTING_EXPIRED",
  "EXTERNAL_LISTING_REMOVED",
  "EXTERNAL_LISTING_COVER_READY",
]);

const INVALID_JSON = Symbol("invalid-listing-import-admin-json");

function safeAudit(
  entries: readonly ListingImportAdminAuditEntry[],
): readonly ListingImportAdminAuditEntry[] {
  return entries
    .filter((entry) =>
      SAFE_AUDIT_ACTIONS.has(entry.action as ListingImportAuditAction),
    )
    .slice(0, 50);
}

function copySafeJson(
  value: unknown,
  depth: number,
  budget: { nodes: number },
): ListingImportAdminJsonValue | typeof INVALID_JSON {
  budget.nodes -= 1;
  if (budget.nodes < 0 || depth > 6) return INVALID_JSON;
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return typeof value === "string" && value.length > 4096
      ? INVALID_JSON
      : value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : INVALID_JSON;
  }
  if (Array.isArray(value)) {
    if (value.length > 100) return INVALID_JSON;
    const result: ListingImportAdminJsonValue[] = [];
    for (const item of value) {
      const copied = copySafeJson(item, depth + 1, budget);
      if (copied === INVALID_JSON) return INVALID_JSON;
      result.push(copied);
    }
    return result;
  }
  if (!value || typeof value !== "object") return INVALID_JSON;
  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) return INVALID_JSON;
  const entries = Object.entries(value);
  if (entries.length > 100) return INVALID_JSON;
  const result: Record<string, ListingImportAdminJsonValue> = {};
  for (const [key, item] of entries) {
    if (key.length > 100 || key === "__proto__") return INVALID_JSON;
    const copied = copySafeJson(item, depth + 1, budget);
    if (copied === INVALID_JSON) return INVALID_JSON;
    result[key] = copied;
  }
  return result;
}

function safeAttribution(
  value: unknown,
): Readonly<Record<string, ListingImportAdminJsonValue>> | null {
  const copied = copySafeJson(value, 0, { nodes: 256 });
  if (
    copied === INVALID_JSON ||
    copied === null ||
    Array.isArray(copied) ||
    typeof copied !== "object" ||
    Buffer.byteLength(JSON.stringify(copied), "utf8") > 8192
  ) {
    return null;
  }
  return copied as Readonly<Record<string, ListingImportAdminJsonValue>>;
}

function withoutKey<T extends object, K extends keyof T>(
  value: T,
  key: K,
): Omit<T, K> {
  const copy = { ...value };
  Reflect.deleteProperty(copy, key);
  return copy;
}

function pageWithCursor(
  active: ListingImportAdminRepositoryLandingPage,
): ListingImportAdminLandingResult["active"] {
  switch (active.view) {
    case "candidates":
      return {
        view: active.view,
        page: {
          rows: active.page.rows,
          nextCursor: active.page.next
            ? encodeListingImportAdminCursor(active.view, active.page.next)
            : null,
        },
      };
    case "batches":
      return {
        view: active.view,
        page: {
          rows: active.page.rows,
          nextCursor: active.page.next
            ? encodeListingImportAdminCursor(active.view, active.page.next)
            : null,
        },
      };
    case "listings":
      return {
        view: active.view,
        page: {
          rows: active.page.rows,
          nextCursor: active.page.next
            ? encodeListingImportAdminCursor(active.view, active.page.next)
            : null,
        },
      };
    case "credentials":
      return {
        view: active.view,
        page: {
          rows: active.page.rows,
          nextCursor: active.page.next
            ? encodeListingImportAdminCursor(active.view, active.page.next)
            : null,
        },
      };
  }
}

export class ListingImportAdminQueryService {
  constructor(private readonly repository: ListingImportAdminQueryRepository) {}

  async landing(
    principal: AuthPrincipal | null,
    query: ListingImportAdminLandingQuery,
  ): Promise<ListingImportAdminLandingResult> {
    requireSuperAdminPrincipal(principal);
    const result = await this.repository.landing(query);
    if (result.active.view !== query.view) {
      throw new Error("Listing import admin query returned the wrong view.");
    }
    return {
      summary: result.summary,
      sources: result.sources,
      active: pageWithCursor(result.active),
    };
  }

  async batchDetail(principal: AuthPrincipal | null, id: string) {
    requireSuperAdminPrincipal(principal);
    return this.repository.batchDetail(id);
  }

  async candidateDetail(
    principal: AuthPrincipal | null,
    id: string,
  ): Promise<ListingImportAdminCandidateDetail | null> {
    requireSuperAdminPrincipal(principal);
    const record = await this.repository.candidateDetail(id);
    if (!record) return null;
    const parsed = candidatePayloadSchema.safeParse(record.currentPayload);
    const candidate = withoutKey(withoutKey(record, "currentPayload"), "audit");
    return {
      ...candidate,
      payload: parsed.success
        ? (parsed.data as ListingImportAdminCandidatePayload)
        : null,
      payloadValid: parsed.success,
      audit: safeAudit(record.audit),
    };
  }

  async externalListingDetail(
    principal: AuthPrincipal | null,
    id: string,
  ): Promise<ListingImportAdminExternalListingDetail | null> {
    requireSuperAdminPrincipal(principal);
    const record = await this.repository.externalListingDetail(id);
    if (!record) return null;
    const attribution = safeAttribution(record.attribution);
    const listing = withoutKey(withoutKey(record, "attribution"), "audit");
    return {
      ...listing,
      attribution,
      attributionValid: attribution !== null,
      audit: safeAudit(record.audit),
    };
  }
}
