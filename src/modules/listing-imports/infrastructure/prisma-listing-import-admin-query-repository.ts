import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";

import type {
  ListingImportAdminAuditEntry,
  ListingImportAdminBatchCounts,
  ListingImportAdminBatchDetail,
  ListingImportAdminBatchRow,
  ListingImportAdminCandidateDetailRecord,
  ListingImportAdminCandidateRow,
  ListingImportAdminCredentialRow,
  ListingImportAdminDuplicateMatch,
  ListingImportAdminExternalListingDetailRecord,
  ListingImportAdminExternalListingRow,
  ListingImportAdminLandingQuery,
  ListingImportAdminQueryRepository,
  ListingImportAdminRepositoryLandingPage,
  ListingImportAdminRepositoryLandingResult,
  ListingImportAdminSourceSummary,
} from "../application/admin-query-ports";
import type {
  ListingImportValidationCode,
  ListingProbableDuplicateReason,
} from "../domain/types";

const MAXIMUM_DETAIL_ROWS = 200;
const MAXIMUM_DETAIL_DUPLICATES = 100;
const MAXIMUM_DETAIL_AUDIT_ENTRIES = 50;

const VALIDATION_CODES = new Set<ListingImportValidationCode>([
  "ITEM_INVALID",
  "SOURCE_LISTING_ID_INVALID",
  "SOURCE_URL_INVALID",
  "SOURCE_HOST_NOT_ALLOWED",
  "SOURCE_QUERY_PARAMETER_NOT_ALLOWED",
  "RETRIEVED_AT_INVALID",
  "CONTENT_HASH_INVALID",
  "CONTENT_HASH_MISMATCH",
  "EVENT_TYPE_INVALID",
  "TITLE_INVALID",
  "DESCRIPTION_INVALID",
  "LOCAL_STARTS_AT_INVALID",
  "LOCAL_ENDS_AT_INVALID",
  "TIMEZONE_INVALID",
  "SCHEDULE_INVALID",
  "ADDRESS_LINE_1_INVALID",
  "ADDRESS_LINE_2_INVALID",
  "CITY_INVALID",
  "REGION_INVALID",
  "POSTAL_CODE_INVALID",
  "COUNTRY_CODE_INVALID",
  "PRIVACY_MODE_INVALID",
]);

const DUPLICATE_REASONS = new Set<ListingProbableDuplicateReason>([
  "FULL_ADDRESS_SCHEDULE_OVERLAP",
  "TITLE_POSTAL_DATE_SIMILARITY",
  "CONFIRMED_LOCATION_SCHEDULE_OVERLAP",
]);

const sourceSelect = {
  id: true,
  key: true,
  name: true,
  productionAllowed: true,
} as const;

function sourceSummary(source: {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly productionAllowed: boolean;
}): ListingImportAdminSourceSummary {
  return source;
}

function batchCounts(batch: {
  readonly totalRows: number;
  readonly candidateRows: number;
  readonly invalidRows: number;
  readonly exactDuplicateRows: number;
  readonly sourceChangedRows: number;
  readonly identityConflictRows: number;
}): ListingImportAdminBatchCounts {
  return {
    total: batch.totalRows,
    candidate: batch.candidateRows,
    invalid: batch.invalidRows,
    exactDuplicate: batch.exactDuplicateRows,
    sourceChanged: batch.sourceChangedRows,
    identityConflict: batch.identityConflictRows,
  };
}

function titleFromPayload(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    typeof (payload as { readonly title?: unknown }).title === "string"
  ) {
    const title = (payload as { readonly title: string }).title.trim();
    if (title.length >= 3 && title.length <= 120) return title;
  }
  return fallback;
}

function safeValidationCodes(value: unknown): ListingImportValidationCode[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is ListingImportValidationCode =>
          typeof entry === "string" &&
          VALIDATION_CODES.has(entry as ListingImportValidationCode),
      )
    : [];
}

function safeDuplicateReasons(
  value: unknown,
): ListingProbableDuplicateReason[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is ListingProbableDuplicateReason =>
          typeof entry === "string" &&
          DUPLICATE_REASONS.has(entry as ListingProbableDuplicateReason),
      )
    : [];
}

function publicationSnapshotEndsAt(value: unknown): Date | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const projection = (value as { readonly projection?: unknown }).projection;
  if (
    !projection ||
    typeof projection !== "object" ||
    Array.isArray(projection)
  ) {
    return null;
  }
  const endsAt = (projection as { readonly endsAt?: unknown }).endsAt;
  if (typeof endsAt !== "string") return null;
  const parsed = new Date(endsAt);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function pageResult<T extends { readonly id: string }>(
  rows: readonly T[],
  limit: number,
  at: (row: T) => Date,
): {
  readonly rows: readonly T[];
  readonly next: { at: Date; id: string } | null;
} {
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    rows: page,
    next: rows.length > limit && last ? { at: at(last), id: last.id } : null,
  };
}

function mapAudit(
  entries: readonly {
    readonly id: bigint;
    readonly action: string;
    readonly occurredAt: Date;
    readonly requestId: string | null;
  }[],
): readonly ListingImportAdminAuditEntry[] {
  return entries.slice(0, MAXIMUM_DETAIL_AUDIT_ENTRIES).map((entry) => ({
    id: entry.id.toString(),
    action: entry.action,
    occurredAt: entry.occurredAt,
    requestId: entry.requestId,
  }));
}

export class PrismaListingImportAdminQueryRepository implements ListingImportAdminQueryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async landing(
    query: ListingImportAdminLandingQuery,
  ): Promise<ListingImportAdminRepositoryLandingResult> {
    const [
      pendingCandidates,
      batches,
      publishedListings,
      activeCredentials,
      sources,
      active,
    ] = await Promise.all([
      this.prisma.listingImportCandidate.count({
        where: { status: "PENDING_REVIEW" },
      }),
      this.prisma.listingImportBatch.count(),
      this.prisma.externalListing.count({ where: { status: "PUBLISHED" } }),
      this.prisma.listingIngestionCredential.count({
        where: { revokedAt: null, source: { enabled: true } },
      }),
      this.prisma.listingImportSource.findMany({
        where: { enabled: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: sourceSelect,
      }),
      this.activeLandingPage(query),
    ]);

    return {
      summary: {
        pendingCandidates,
        batches,
        publishedListings,
        activeCredentials,
      },
      sources: sources.map(sourceSummary),
      active,
    };
  }

  async batchDetail(id: string): Promise<ListingImportAdminBatchDetail | null> {
    const batch = await this.prisma.listingImportBatch.findUnique({
      where: { id },
      select: {
        id: true,
        transport: true,
        contractVersion: true,
        parserVersion: true,
        ingestorRunId: true,
        ingestorInstanceId: true,
        status: true,
        totalRows: true,
        candidateRows: true,
        invalidRows: true,
        exactDuplicateRows: true,
        sourceChangedRows: true,
        identityConflictRows: true,
        createdAt: true,
        completedAt: true,
        sealedAt: true,
        source: { select: sourceSelect },
        rows: {
          orderBy: { rowNumber: "asc" },
          take: MAXIMUM_DETAIL_ROWS,
          select: {
            rowNumber: true,
            status: true,
            validationFailures: true,
            createdAt: true,
            createdCandidate: { select: { id: true } },
          },
        },
      },
    });
    if (!batch) return null;
    return {
      id: batch.id,
      source: sourceSummary(batch.source),
      transport: batch.transport,
      contractVersion: batch.contractVersion,
      parserVersion: batch.parserVersion,
      ingestorRunId: batch.ingestorRunId,
      ingestorInstanceId: batch.ingestorInstanceId,
      counts: batchCounts(batch),
      status: batch.status,
      createdAt: batch.createdAt,
      completedAt: batch.completedAt,
      sealedAt: batch.sealedAt,
      rows: batch.rows.map((row) => ({
        rowNumber: row.rowNumber,
        status: row.status,
        validationCodes: safeValidationCodes(row.validationFailures),
        candidateId:
          row.status === "CANDIDATE_CREATED"
            ? (row.createdCandidate?.id ?? null)
            : null,
        observedAt: row.createdAt,
      })),
    };
  }

  async candidateDetail(
    id: string,
  ): Promise<ListingImportAdminCandidateDetailRecord | null> {
    const [candidate, audit] = await Promise.all([
      this.prisma.listingImportCandidate.findUnique({
        where: { id },
        select: {
          id: true,
          sourceRecordId: true,
          creationObservationId: true,
          latestObservationId: true,
          currentPayload: true,
          normalizedTitle: true,
          normalizedAddress: true,
          normalizedCity: true,
          normalizedPostalCode: true,
          startsAt: true,
          endsAt: true,
          latitude: true,
          longitude: true,
          locationProviderPlaceId: true,
          locationProviderName: true,
          locationProviderVersion: true,
          locationProviderAttribution: true,
          locationResolutionSource: true,
          locationConfirmationStatus: true,
          locationConfirmedByUserId: true,
          locationConfirmedAt: true,
          status: true,
          version: true,
          reviewedByUserId: true,
          reviewedAt: true,
          reviewReason: true,
          createdAt: true,
          updatedAt: true,
          sourceRecord: {
            select: {
              sourceListingId: true,
              canonicalSourceUrl: true,
              firstSeenAt: true,
              lastSeenAt: true,
              lastContentHash: true,
              source: { select: sourceSelect },
            },
          },
          creationObservation: {
            select: {
              contentHash: true,
              batch: { select: { createdAt: true } },
            },
          },
          latestObservation: { select: { contentHash: true } },
          duplicateMatches: {
            orderBy: [
              { resolution: "asc" },
              { createdAt: "asc" },
              { id: "asc" },
            ],
            take: MAXIMUM_DETAIL_DUPLICATES + 1,
            select: {
              id: true,
              resolution: true,
              reasons: true,
              resolvedByUserId: true,
              resolvedAt: true,
              createdAt: true,
              event: {
                select: {
                  id: true,
                  publicId: true,
                  title: true,
                  endsAt: true,
                  deletedAt: true,
                  canceledAt: true,
                  removedAt: true,
                  publication: {
                    select: { canonicalPath: true, snapshot: true },
                  },
                },
              },
              externalListing: {
                select: {
                  id: true,
                  publicId: true,
                  title: true,
                  canonicalPath: true,
                  status: true,
                  endsAt: true,
                },
              },
            },
          },
          externalListing: { select: { id: true } },
          _count: {
            select: {
              duplicateMatches: { where: { resolution: "UNRESOLVED" } },
            },
          },
        },
      }),
      this.prisma.auditEntry.findMany({
        where: {
          targetType: "LISTING_IMPORT_CANDIDATE",
          targetId: id,
          action: {
            in: [
              "LISTING_IMPORT_CANDIDATE_CREATED",
              "LISTING_IMPORT_CANDIDATE_UPDATED",
              "LISTING_IMPORT_CANDIDATE_APPROVED",
              "LISTING_IMPORT_CANDIDATE_REJECTED",
              "LISTING_IMPORT_CANDIDATE_DELETED",
              "LISTING_IMPORT_DUPLICATE_RESOLVED",
            ],
          },
        },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: MAXIMUM_DETAIL_AUDIT_ENTRIES + 1,
        select: {
          id: true,
          action: true,
          occurredAt: true,
          requestId: true,
        },
      }),
    ]);
    if (!candidate) return null;

    const duplicates: ListingImportAdminDuplicateMatch[] = [];
    const queriedAt = new Date();
    for (const match of candidate.duplicateMatches.slice(
      0,
      MAXIMUM_DETAIL_DUPLICATES,
    )) {
      const shared = {
        id: match.id,
        resolution: match.resolution,
        reasons: safeDuplicateReasons(match.reasons),
        resolvedByUserId: match.resolvedByUserId,
        resolvedAt: match.resolvedAt,
        createdAt: match.createdAt,
      } as const;
      if (match.event) {
        const snapshotEndsAt = publicationSnapshotEndsAt(
          match.event.publication?.snapshot,
        );
        duplicates.push({
          ...shared,
          target: {
            kind: "EVENT",
            id: match.event.id,
            publicId: match.event.publicId,
            title: match.event.title ?? "Untitled organizer listing",
            canonicalPath: match.event.publication?.canonicalPath ?? null,
            publicationState: match.event.publication
              ? "PUBLISHED"
              : "UNPUBLISHED",
            endsAt: match.event.endsAt,
            linkAvailable: Boolean(
              match.event.publication &&
              !match.event.deletedAt &&
              !match.event.canceledAt &&
              !match.event.removedAt &&
              snapshotEndsAt &&
              snapshotEndsAt > queriedAt,
            ),
          },
        });
      } else if (match.externalListing) {
        duplicates.push({
          ...shared,
          target: {
            kind: "EXTERNAL_LISTING",
            id: match.externalListing.id,
            publicId: match.externalListing.publicId,
            title: match.externalListing.title,
            canonicalPath: match.externalListing.canonicalPath,
            status: match.externalListing.status,
            endsAt: match.externalListing.endsAt,
            linkAvailable:
              match.externalListing.status === "PUBLISHED" &&
              match.externalListing.endsAt > queriedAt,
          },
        });
      }
    }

    return {
      id: candidate.id,
      sourceRecordId: candidate.sourceRecordId,
      creationObservationId: candidate.creationObservationId,
      latestObservationId: candidate.latestObservationId,
      currentPayload: candidate.currentPayload,
      normalizedTitle: candidate.normalizedTitle,
      normalizedAddress: candidate.normalizedAddress,
      normalizedCity: candidate.normalizedCity,
      normalizedPostalCode: candidate.normalizedPostalCode,
      startsAt: candidate.startsAt,
      endsAt: candidate.endsAt,
      location: {
        latitude:
          candidate.latitude === null ? null : Number(candidate.latitude),
        longitude:
          candidate.longitude === null ? null : Number(candidate.longitude),
        providerPlaceId: candidate.locationProviderPlaceId,
        providerName: candidate.locationProviderName,
        providerVersion: candidate.locationProviderVersion,
        providerAttribution: candidate.locationProviderAttribution,
        resolutionSource: candidate.locationResolutionSource,
        confirmationStatus: candidate.locationConfirmationStatus,
        confirmedByUserId: candidate.locationConfirmedByUserId,
        confirmedAt: candidate.locationConfirmedAt,
      },
      status: candidate.status,
      version: candidate.version,
      reviewedByUserId: candidate.reviewedByUserId,
      reviewedAt: candidate.reviewedAt,
      reviewReason: candidate.reviewReason,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
      provenance: {
        source: sourceSummary(candidate.sourceRecord.source),
        sourceListingId: candidate.sourceRecord.sourceListingId,
        canonicalSourceUrl: candidate.sourceRecord.canonicalSourceUrl,
        firstSeenAt: candidate.sourceRecord.firstSeenAt,
        lastSeenAt: candidate.sourceRecord.lastSeenAt,
        lastContentHash: candidate.sourceRecord.lastContentHash,
        creationContentHash: candidate.creationObservation.contentHash,
        latestContentHash: candidate.latestObservation.contentHash,
        importedAt: candidate.creationObservation.batch.createdAt,
      },
      duplicates,
      duplicatesTruncated:
        candidate.duplicateMatches.length > MAXIMUM_DETAIL_DUPLICATES,
      unresolvedDuplicateCount: candidate._count.duplicateMatches,
      audit: mapAudit(audit),
      auditTruncated: audit.length > MAXIMUM_DETAIL_AUDIT_ENTRIES,
      externalListingId: candidate.externalListing?.id ?? null,
    };
  }

  async externalListingDetail(
    id: string,
  ): Promise<ListingImportAdminExternalListingDetailRecord | null> {
    const [listing, audit] = await Promise.all([
      this.prisma.externalListing.findUnique({
        where: { id },
        select: {
          id: true,
          candidateId: true,
          primarySourceRecordId: true,
          publicId: true,
          slug: true,
          canonicalPath: true,
          eventType: true,
          title: true,
          description: true,
          localStartsAt: true,
          localEndsAt: true,
          startsAt: true,
          endsAt: true,
          timezone: true,
          privacyMode: true,
          status: true,
          version: true,
          attribution: true,
          publishedAt: true,
          expiredAt: true,
          removedAt: true,
          removalReason: true,
          createdAt: true,
          updatedAt: true,
          primarySourceRecord: {
            select: {
              sourceListingId: true,
              canonicalSourceUrl: true,
              firstSeenAt: true,
              lastSeenAt: true,
              lastContentHash: true,
              source: { select: sourceSelect },
            },
          },
          location: true,
        },
      }),
      this.prisma.auditEntry.findMany({
        where: {
          targetType: "EXTERNAL_LISTING",
          targetId: id,
          action: {
            in: [
              "EXTERNAL_LISTING_EDITED",
              "EXTERNAL_LISTING_EXPIRED",
              "EXTERNAL_LISTING_REMOVED",
              "EXTERNAL_LISTING_COVER_READY",
            ],
          },
        },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: MAXIMUM_DETAIL_AUDIT_ENTRIES + 1,
        select: {
          id: true,
          action: true,
          occurredAt: true,
          requestId: true,
        },
      }),
    ]);
    if (!listing) return null;
    const location = listing.location;
    return {
      id: listing.id,
      candidateId: listing.candidateId,
      primarySourceRecordId: listing.primarySourceRecordId,
      publicId: listing.publicId,
      slug: listing.slug,
      canonicalPath: listing.canonicalPath,
      eventType: listing.eventType,
      title: listing.title,
      description: listing.description,
      localStartsAt: listing.localStartsAt,
      localEndsAt: listing.localEndsAt,
      startsAt: listing.startsAt,
      endsAt: listing.endsAt,
      timezone: listing.timezone,
      privacyMode: listing.privacyMode,
      status: listing.status,
      version: listing.version,
      attribution: listing.attribution,
      publishedAt: listing.publishedAt,
      expiredAt: listing.expiredAt,
      removedAt: listing.removedAt,
      removalReason: listing.removalReason,
      createdAt: listing.createdAt,
      updatedAt: listing.updatedAt,
      provenance: {
        source: sourceSummary(listing.primarySourceRecord.source),
        sourceListingId: listing.primarySourceRecord.sourceListingId,
        canonicalSourceUrl: listing.primarySourceRecord.canonicalSourceUrl,
        firstSeenAt: listing.primarySourceRecord.firstSeenAt,
        lastSeenAt: listing.primarySourceRecord.lastSeenAt,
        lastContentHash: listing.primarySourceRecord.lastContentHash,
      },
      location: location
        ? {
            addressLine1: location.addressLine1,
            addressLine2: location.addressLine2,
            city: location.city,
            region: location.region,
            postalCode: location.postalCode,
            countryCode: location.countryCode,
            normalizedAddress: location.normalizedAddress,
            latitude:
              location.latitude === null ? null : Number(location.latitude),
            longitude:
              location.longitude === null ? null : Number(location.longitude),
            timezone: location.timezone,
            providerPlaceId: location.providerPlaceId,
            providerName: location.providerName,
            providerVersion: location.providerVersion,
            providerAttribution: location.providerAttribution,
            resolutionSource: location.resolutionSource,
            confirmationStatus: location.confirmationStatus,
            confirmedByUserId: location.confirmedByUserId,
            confirmedAt: location.confirmedAt,
            publicZone: location.publicZone,
            precision: location.precision,
            confidence:
              location.confidence === null ? null : Number(location.confidence),
            validationStatus: location.validationStatus,
          }
        : null,
      audit: mapAudit(audit),
      auditTruncated: audit.length > MAXIMUM_DETAIL_AUDIT_ENTRIES,
    };
  }

  private async activeLandingPage(
    query: ListingImportAdminLandingQuery,
  ): Promise<ListingImportAdminRepositoryLandingPage> {
    switch (query.view) {
      case "candidates":
        return { view: query.view, page: await this.candidatePage(query) };
      case "batches":
        return { view: query.view, page: await this.batchPage(query) };
      case "listings":
        return { view: query.view, page: await this.listingPage(query) };
      case "credentials":
        return { view: query.view, page: await this.credentialPage(query) };
    }
  }

  private async candidatePage(query: ListingImportAdminLandingQuery) {
    const cursor = query.cursor;
    const rows = await this.prisma.listingImportCandidate.findMany({
      where: {
        status: "PENDING_REVIEW",
        ...(cursor
          ? {
              OR: [
                { startsAt: { gt: cursor.at } },
                { startsAt: cursor.at, id: { gt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      take: query.limit + 1,
      select: {
        id: true,
        currentPayload: true,
        normalizedTitle: true,
        normalizedAddress: true,
        normalizedCity: true,
        startsAt: true,
        endsAt: true,
        createdAt: true,
        status: true,
        version: true,
        sourceRecord: { select: { source: { select: sourceSelect } } },
        _count: {
          select: {
            duplicateMatches: { where: { resolution: "UNRESOLVED" } },
          },
        },
      },
    });
    const mapped: ListingImportAdminCandidateRow[] = rows.map((row) => ({
      id: row.id,
      title: titleFromPayload(row.currentPayload, row.normalizedTitle),
      source: sourceSummary(row.sourceRecord.source),
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      city: row.normalizedCity,
      locationSummary: row.normalizedAddress,
      unresolvedDuplicateCount: row._count.duplicateMatches,
      importedAt: row.createdAt,
      status: row.status,
      version: row.version,
    }));
    return pageResult(mapped, query.limit, (row) => row.startsAt);
  }

  private async batchPage(query: ListingImportAdminLandingQuery) {
    const cursor = query.cursor;
    const rows = await this.prisma.listingImportBatch.findMany({
      where: cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.at } },
              { createdAt: cursor.at, id: { lt: cursor.id } },
            ],
          }
        : {},
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      select: {
        id: true,
        transport: true,
        parserVersion: true,
        ingestorRunId: true,
        ingestorInstanceId: true,
        status: true,
        totalRows: true,
        candidateRows: true,
        invalidRows: true,
        exactDuplicateRows: true,
        sourceChangedRows: true,
        identityConflictRows: true,
        createdAt: true,
        source: { select: sourceSelect },
      },
    });
    const mapped: ListingImportAdminBatchRow[] = rows.map((row) => ({
      id: row.id,
      source: sourceSummary(row.source),
      transport: row.transport,
      parserVersion: row.parserVersion,
      ingestorRunId: row.ingestorRunId,
      ingestorInstanceId: row.ingestorInstanceId,
      counts: batchCounts(row),
      status: row.status,
      createdAt: row.createdAt,
    }));
    return pageResult(mapped, query.limit, (row) => row.createdAt);
  }

  private async listingPage(query: ListingImportAdminLandingQuery) {
    const cursor = query.cursor;
    const rows = await this.prisma.externalListing.findMany({
      where: {
        status: "PUBLISHED",
        ...(cursor
          ? {
              OR: [
                { publishedAt: { lt: cursor.at } },
                { publishedAt: cursor.at, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        status: true,
        publishedAt: true,
        version: true,
        primarySourceRecord: {
          select: { source: { select: sourceSelect } },
        },
      },
    });
    const mapped: ListingImportAdminExternalListingRow[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      source: sourceSummary(row.primarySourceRecord.source),
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      status: row.status,
      publishedAt: row.publishedAt,
      version: row.version,
    }));
    return pageResult(mapped, query.limit, (row) => row.publishedAt);
  }

  private async credentialPage(query: ListingImportAdminLandingQuery) {
    const cursor = query.cursor;
    const rows = await this.prisma.listingIngestionCredential.findMany({
      where: cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.at } },
              { createdAt: cursor.at, id: { lt: cursor.id } },
            ],
          }
        : {},
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      select: {
        id: true,
        name: true,
        displayPrefix: true,
        createdAt: true,
        lastUsedAt: true,
        revokedAt: true,
        source: { select: sourceSelect },
      },
    });
    const mapped: ListingImportAdminCredentialRow[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      source: sourceSummary(row.source),
      displayPrefix: row.displayPrefix,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
      revokedAt: row.revokedAt,
    }));
    return pageResult(mapped, query.limit, (row) => row.createdAt);
  }
}
