import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { RECENT_PASSWORD_TTL_MS } from "@/modules/auth";

import { eventSlug, futurePublicPath } from "../../events/domain/slug";
import {
  ListingImportReviewError,
  reviewStaleVersion,
} from "../application/review-errors";
import type {
  ApprovedExternalListingResult,
  CandidateLocationInput,
  CandidateReviewMutationResult,
  ConfirmCandidateLocationCommand,
  DeleteCandidateCommand,
  DuplicateResolutionResult,
  EditCandidateCommand,
  ExternalListingEditCommand,
  ExternalListingMutationResult,
  ExternalListingRemovalCommand,
  ListingImportReviewAuthorization,
  ListingImportReviewRepository,
  ResolveCandidateDuplicateCommand,
} from "../application/review-ports";
import {
  normalizeReviewedListingContent,
  reviewedCandidatePayloadSchema,
  reviewedPayloadWithContent,
  type ReviewedCandidatePayload,
} from "../application/review-schemas";
import { normalizeComparableText } from "../domain/normalization";
import { findPrismaDuplicateTargets } from "./prisma-duplicate-matcher";

const MAX_TRANSACTION_ATTEMPTS = 4;
const MAX_PUBLIC_ID_ATTEMPTS = 8;
const TRANSACTION_TIMEOUT_MILLISECONDS = 15_000;

type Transaction = Prisma.TransactionClient;

interface CandidateComparableRecord {
  readonly id: string;
  readonly normalizedTitle: string;
  readonly normalizedAddress: string | null;
  readonly normalizedPostalCode: string | null;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly latitude: Prisma.Decimal | null;
  readonly longitude: Prisma.Decimal | null;
  readonly locationConfirmationStatus: string;
}

type ApprovalOutcome =
  | { readonly status: "BLOCKED"; readonly unresolvedDuplicateCount: number }
  | {
      readonly status: "APPROVED";
      readonly result: ApprovedExternalListingResult;
    };

function jsonDocument(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function reasonDigest(reason: string): string {
  return createHash("sha256").update(reason, "utf8").digest("hex");
}

function isRetryableTransactionError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

function isUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function targetKey(input: {
  readonly eventId: string | null;
  readonly externalListingId: string | null;
}): string {
  return input.eventId
    ? `event:${input.eventId}`
    : `external:${input.externalListingId ?? ""}`;
}

function parsedPayload(value: Prisma.JsonValue): ReviewedCandidatePayload {
  const parsed = reviewedCandidatePayloadSchema.safeParse(value);
  if (!parsed.success) {
    throw new ListingImportReviewError(
      "INVALID_CANDIDATE_CONTENT",
      422,
      "The candidate content is not valid for review.",
    );
  }
  return parsed.data;
}

function locationInput(
  payload: ReviewedCandidatePayload,
): CandidateLocationInput {
  if (!payload.addressLine1) {
    throw new ListingImportReviewError(
      "LOCATION_REQUIRED",
      422,
      "Enter a complete address before confirming the location.",
    );
  }
  return {
    addressLine1: payload.addressLine1,
    addressLine2: payload.addressLine2,
    city: payload.city,
    region: payload.region,
    postalCode: payload.postalCode,
    countryCode: payload.countryCode,
    timezone: payload.timezone,
  };
}

function sameLocationInput(
  left: CandidateLocationInput,
  right: CandidateLocationInput,
): boolean {
  return (
    left.addressLine1 === right.addressLine1 &&
    left.addressLine2 === right.addressLine2 &&
    left.city === right.city &&
    left.region === right.region &&
    left.postalCode === right.postalCode &&
    left.countryCode === right.countryCode &&
    left.timezone === right.timezone
  );
}

function candidateLocationChanged(
  current: ReviewedCandidatePayload,
  next: ReviewedCandidatePayload,
): boolean {
  return (
    current.addressLine1 !== next.addressLine1 ||
    current.addressLine2 !== next.addressLine2 ||
    current.city !== next.city ||
    current.region !== next.region ||
    current.postalCode !== next.postalCode ||
    current.countryCode !== next.countryCode ||
    current.timezone !== next.timezone
  );
}

function changedCandidateFields(
  current: ReviewedCandidatePayload,
  next: ReviewedCandidatePayload,
): readonly string[] {
  const fields = [
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
  return fields.filter((field) => current[field] !== next[field]);
}

function candidateComparable(
  candidate: CandidateComparableRecord,
): Parameters<typeof findPrismaDuplicateTargets>[1][number] {
  const confirmed =
    candidate.locationConfirmationStatus === "CONFIRMED" &&
    candidate.latitude !== null &&
    candidate.longitude !== null;
  return {
    candidateId: candidate.id,
    normalizedTitle: candidate.normalizedTitle,
    normalizedAddress: candidate.normalizedAddress ?? "",
    normalizedPostalCode: candidate.normalizedPostalCode ?? "",
    startsAt: candidate.startsAt,
    endsAt: candidate.endsAt,
    confirmedPoint: confirmed
      ? {
          latitude: Number(candidate.latitude),
          longitude: Number(candidate.longitude),
        }
      : null,
  };
}

export class PrismaListingImportReviewRepository implements ListingImportReviewRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly publicIdFactory: () => string = () =>
      randomBytes(6).toString("hex"),
  ) {}

  private async serializable<T>(
    operation: (transaction: Transaction) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: TRANSACTION_TIMEOUT_MILLISECONDS,
        });
      } catch (error) {
        if (
          attempt < MAX_TRANSACTION_ATTEMPTS &&
          isRetryableTransactionError(error)
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new Error("The listing review transaction did not complete.");
  }

  private async assertAdministrator(
    transaction: Transaction,
    authorization: ListingImportReviewAuthorization,
  ): Promise<void> {
    const actor = authorization.actor;
    if (authorization.requireRecentSession) {
      if (!actor.sessionId) {
        throw new ListingImportReviewError(
          "ACTOR_NOT_AUTHORIZED",
          403,
          "Recent administrator authorization is required.",
        );
      }
      const recentPasswordCutoff = new Date(
        authorization.authorizationAt.getTime() - RECENT_PASSWORD_TTL_MS,
      );
      const session = await transaction.session.findFirst({
        where: {
          id: actor.sessionId,
          userId: actor.userId,
          expiresAt: { gt: authorization.authorizationAt },
          passwordAuthenticatedAt: { gte: recentPasswordCutoff },
          user: {
            is: {
              role: "SUPER_ADMIN",
              status: "ACTIVE",
              emailVerifiedAt: { not: null },
            },
          },
        },
        select: { id: true },
      });
      if (session) return;
    } else {
      const administrator = await transaction.user.findFirst({
        where: {
          id: actor.userId,
          role: "SUPER_ADMIN",
          status: "ACTIVE",
          emailVerifiedAt: { not: null },
        },
        select: { id: true },
      });
      if (administrator) return;
    }
    throw new ListingImportReviewError(
      "ACTOR_NOT_AUTHORIZED",
      403,
      "An active administrator session is required.",
    );
  }

  private async lockCandidate(
    transaction: Transaction,
    candidateId: string,
  ): Promise<void> {
    await transaction.$queryRaw(Prisma.sql`
      SELECT "id"
      FROM "listing_import_candidates"
      WHERE "id" = ${candidateId}::uuid
      FOR UPDATE
    `);
  }

  private async requirePendingCandidate(
    transaction: Transaction,
    candidateId: string,
    expectedVersion: number,
  ) {
    await this.lockCandidate(transaction, candidateId);
    const candidate = await transaction.listingImportCandidate.findUnique({
      where: { id: candidateId },
      include: {
        sourceRecord: { include: { source: true } },
      },
    });
    if (!candidate) {
      throw new ListingImportReviewError(
        "CANDIDATE_NOT_FOUND",
        404,
        "The listing import candidate was not found.",
      );
    }
    if (candidate.status !== "PENDING_REVIEW") {
      throw new ListingImportReviewError(
        "INVALID_LIFECYCLE",
        409,
        "This candidate has already completed review.",
      );
    }
    if (candidate.version !== expectedVersion) throw reviewStaleVersion();
    return candidate;
  }

  private async synchronizeDuplicateMatches(
    transaction: Transaction,
    candidate: CandidateComparableRecord,
  ): Promise<number> {
    const probable =
      (
        await findPrismaDuplicateTargets(transaction, [
          candidateComparable(candidate),
        ])
      ).get(candidate.id) ?? [];
    const probableByTarget = new Map(
      probable.map(
        (target) =>
          [
            target.targetKind === "EVENT"
              ? `event:${target.targetId}`
              : `external:${target.targetId}`,
            target,
          ] as const,
      ),
    );
    const existing = await transaction.listingDuplicateMatch.findMany({
      where: { candidateId: candidate.id },
      select: {
        id: true,
        eventId: true,
        externalListingId: true,
        reasons: true,
        resolution: true,
      },
    });
    const existingByTarget = new Map(
      existing.map((match) => [targetKey(match), match] as const),
    );

    const obsoleteUnresolvedIds = existing
      .filter(
        (match) =>
          match.resolution === "UNRESOLVED" &&
          !probableByTarget.has(targetKey(match)),
      )
      .map((match) => match.id);
    if (obsoleteUnresolvedIds.length > 0) {
      await transaction.listingDuplicateMatch.deleteMany({
        where: { id: { in: obsoleteUnresolvedIds }, resolution: "UNRESOLVED" },
      });
    }

    for (const [key, target] of probableByTarget) {
      const match = existingByTarget.get(key);
      if (!match) {
        await transaction.listingDuplicateMatch.create({
          data: {
            candidateId: candidate.id,
            ...(target.targetKind === "EVENT"
              ? { eventId: target.targetId }
              : { externalListingId: target.targetId }),
            reasons: [...target.reasons],
          },
        });
      } else if (
        match.resolution === "UNRESOLVED" &&
        JSON.stringify(match.reasons) !== JSON.stringify(target.reasons)
      ) {
        await transaction.listingDuplicateMatch.update({
          where: { id: match.id },
          data: { reasons: [...target.reasons] },
        });
      }
    }
    return transaction.listingDuplicateMatch.count({
      where: { candidateId: candidate.id, resolution: "UNRESOLVED" },
    });
  }

  private async assertLinkTargetCurrent(
    transaction: Transaction,
    match: {
      readonly eventId: string | null;
      readonly externalListingId: string | null;
    },
  ): Promise<void> {
    const targets = match.eventId
      ? await transaction.$queryRaw<{ readonly id: string }[]>(Prisma.sql`
          SELECT event."id"
          FROM "events" event
          JOIN "event_publications" publication
            ON publication."event_id" = event."id"
          WHERE event."id" = ${match.eventId}::uuid
            AND event."deleted_at" IS NULL
            AND event."canceled_at" IS NULL
            AND event."removed_at" IS NULL
            AND (
              publication."snapshot" -> 'projection' ->> 'endsAt'
            )::TIMESTAMPTZ > CURRENT_TIMESTAMP
          FOR SHARE OF event, publication
        `)
      : await transaction.$queryRaw<{ readonly id: string }[]>(Prisma.sql`
          SELECT listing."id"
          FROM "external_listings" listing
          WHERE listing."id" = ${match.externalListingId}::uuid
            AND listing."status" = 'PUBLISHED'::"external_listing_status"
            AND listing."ends_at" > CURRENT_TIMESTAMP
          FOR SHARE
        `);
    if (targets.length === 0) {
      throw new ListingImportReviewError(
        "DUPLICATE_NO_LONGER_CURRENT",
        409,
        "Only a currently published duplicate target can be linked.",
      );
    }
  }

  async candidateLocationInput(input: {
    readonly candidateId: string;
    readonly expectedVersion: number;
    readonly authorization: ListingImportReviewAuthorization;
  }): Promise<CandidateLocationInput> {
    return this.serializable(async (transaction) => {
      await this.assertAdministrator(transaction, input.authorization);
      const candidate = await this.requirePendingCandidate(
        transaction,
        input.candidateId,
        input.expectedVersion,
      );
      return locationInput(parsedPayload(candidate.currentPayload));
    });
  }

  async editCandidate(
    input: EditCandidateCommand,
  ): Promise<CandidateReviewMutationResult> {
    return this.serializable(async (transaction) => {
      await this.assertAdministrator(transaction, input.authorization);
      const candidate = await this.requirePendingCandidate(
        transaction,
        input.candidateId,
        input.expectedVersion,
      );
      const currentPayload = parsedPayload(candidate.currentPayload);
      const nextPayload = reviewedPayloadWithContent(
        currentPayload,
        input.content,
      );
      const changedFields = changedCandidateFields(currentPayload, nextPayload);
      const locationChanged = candidateLocationChanged(
        currentPayload,
        nextPayload,
      );
      const shouldRecompute =
        locationChanged ||
        currentPayload.normalizedTitle !== nextPayload.normalizedTitle ||
        currentPayload.normalizedPostalCode !==
          nextPayload.normalizedPostalCode ||
        currentPayload.startsAt !== nextPayload.startsAt ||
        currentPayload.endsAt !== nextPayload.endsAt;

      if (locationChanged) {
        const resetPayload = { ...nextPayload, locationResolution: null };
        await transaction.$executeRaw(Prisma.sql`
          UPDATE "listing_import_candidates"
          SET
            "current_payload" = ${JSON.stringify(resetPayload)}::jsonb,
            "normalized_title" = ${resetPayload.normalizedTitle},
            "normalized_address" = ${resetPayload.normalizedAddress || null},
            "normalized_city" = ${resetPayload.normalizedCity},
            "normalized_postal_code" = ${resetPayload.normalizedPostalCode || null},
            "starts_at" = ${new Date(resetPayload.startsAt)},
            "ends_at" = ${new Date(resetPayload.endsAt)},
            "latitude" = NULL,
            "longitude" = NULL,
            "coordinates" = NULL,
            "location_provider_place_id" = NULL,
            "location_provider_name" = NULL,
            "location_provider_version" = NULL,
            "location_provider_attribution" = NULL,
            "location_resolution_source" = 'UNCONFIRMED_DRAFT',
            "location_confirmation_status" = 'UNCONFIRMED',
            "location_confirmed_by_user_id" = NULL,
            "location_confirmed_at" = NULL,
            "version" = "version" + 1,
            "updated_at" = ${input.now}
          WHERE "id" = ${candidate.id}::uuid
        `);
      } else {
        await transaction.listingImportCandidate.update({
          where: { id: candidate.id },
          data: {
            currentPayload: jsonDocument(nextPayload),
            normalizedTitle: nextPayload.normalizedTitle,
            normalizedAddress: nextPayload.normalizedAddress || null,
            normalizedCity: nextPayload.normalizedCity,
            normalizedPostalCode: nextPayload.normalizedPostalCode || null,
            startsAt: new Date(nextPayload.startsAt),
            endsAt: new Date(nextPayload.endsAt),
            version: { increment: 1 },
            updatedAt: input.now,
          },
        });
      }
      const updated =
        await transaction.listingImportCandidate.findUniqueOrThrow({
          where: { id: candidate.id },
        });
      const unresolvedDuplicateCount = shouldRecompute
        ? await this.synchronizeDuplicateMatches(transaction, updated)
        : await transaction.listingDuplicateMatch.count({
            where: { candidateId: candidate.id, resolution: "UNRESOLVED" },
          });
      await transaction.auditEntry.create({
        data: {
          actorUserId: input.authorization.actor.userId,
          action: "LISTING_IMPORT_CANDIDATE_UPDATED",
          targetType: "LISTING_IMPORT_CANDIDATE",
          targetId: candidate.id,
          requestId: input.audit.requestId ?? null,
          metadata: {
            candidateId: candidate.id,
            version: updated.version,
            changedFields,
            locationConfirmationReset: locationChanged,
            unresolvedDuplicateCount,
          },
        },
      });
      return {
        candidateId: candidate.id,
        version: updated.version,
        status: updated.status,
        unresolvedDuplicateCount,
      };
    });
  }

  async confirmCandidateLocation(
    input: ConfirmCandidateLocationCommand,
  ): Promise<CandidateReviewMutationResult> {
    return this.serializable(async (transaction) => {
      await this.assertAdministrator(transaction, input.authorization);
      const candidate = await this.requirePendingCandidate(
        transaction,
        input.candidateId,
        input.expectedVersion,
      );
      const currentPayload = parsedPayload(candidate.currentPayload);
      if (
        !sameLocationInput(
          locationInput(currentPayload),
          input.expectedLocationInput,
        )
      ) {
        throw reviewStaleVersion();
      }
      if (input.location.timezone !== currentPayload.timezone) {
        throw new ListingImportReviewError(
          "INVALID_CANDIDATE_CONTENT",
          422,
          "The resolved location timezone does not match the schedule.",
        );
      }
      let content;
      try {
        content = normalizeReviewedListingContent({
          eventType: currentPayload.eventType,
          title: currentPayload.title,
          description: currentPayload.description,
          localStartsAt: currentPayload.localStartsAt,
          localEndsAt: currentPayload.localEndsAt,
          timezone: currentPayload.timezone,
          privacyMode: currentPayload.privacyMode,
          addressLine1: input.location.addressLine1,
          addressLine2: input.location.addressLine2,
          city: input.location.city,
          region: input.location.region,
          postalCode: input.location.postalCode,
          countryCode: input.location.countryCode,
        });
      } catch (cause) {
        throw new ListingImportReviewError(
          "INVALID_CANDIDATE_CONTENT",
          422,
          "The resolved location is not valid for this candidate.",
          { cause },
        );
      }
      content = {
        ...content,
        normalizedAddress: normalizeComparableText(
          input.location.normalizedAddress,
        ),
      };
      const nextPayload = reviewedPayloadWithContent(currentPayload, content, {
        precision: input.location.precision,
        confidence: input.location.confidence,
        validationStatus: input.location.validationStatus,
      });
      await transaction.$executeRaw(Prisma.sql`
        UPDATE "listing_import_candidates"
        SET
          "current_payload" = ${JSON.stringify(nextPayload)}::jsonb,
          "normalized_title" = ${nextPayload.normalizedTitle},
          "normalized_address" = ${nextPayload.normalizedAddress || null},
          "normalized_city" = ${nextPayload.normalizedCity},
          "normalized_postal_code" = ${nextPayload.normalizedPostalCode || null},
          "starts_at" = ${new Date(nextPayload.startsAt)},
          "ends_at" = ${new Date(nextPayload.endsAt)},
          "latitude" = ${input.location.latitude},
          "longitude" = ${input.location.longitude},
          "coordinates" = ST_SetSRID(
            ST_MakePoint(${input.location.longitude}, ${input.location.latitude}),
            4326
          )::geography,
          "location_provider_place_id" = ${input.location.providerPlaceId},
          "location_provider_name" = ${input.location.providerName},
          "location_provider_version" = NULL,
          "location_provider_attribution" = NULL,
          "location_resolution_source" = 'ADMIN_GEOCODING',
          "location_confirmation_status" = 'CONFIRMED',
          "location_confirmed_by_user_id" = ${input.authorization.actor.userId}::uuid,
          "location_confirmed_at" = ${input.now},
          "version" = "version" + 1,
          "updated_at" = ${input.now}
        WHERE "id" = ${candidate.id}::uuid
      `);
      const updated =
        await transaction.listingImportCandidate.findUniqueOrThrow({
          where: { id: candidate.id },
        });
      const unresolvedDuplicateCount = await this.synchronizeDuplicateMatches(
        transaction,
        updated,
      );
      await transaction.auditEntry.create({
        data: {
          actorUserId: input.authorization.actor.userId,
          action: "LISTING_IMPORT_CANDIDATE_UPDATED",
          targetType: "LISTING_IMPORT_CANDIDATE",
          targetId: candidate.id,
          requestId: input.audit.requestId ?? null,
          metadata: {
            candidateId: candidate.id,
            version: updated.version,
            changedFields: ["location"],
            locationValidationStatus: input.location.validationStatus,
            unresolvedDuplicateCount,
          },
        },
      });
      return {
        candidateId: candidate.id,
        version: updated.version,
        status: updated.status,
        unresolvedDuplicateCount,
      };
    });
  }

  async recomputeCandidateDuplicates(input: {
    readonly candidateId: string;
    readonly expectedVersion: number;
    readonly authorization: ListingImportReviewAuthorization;
    readonly now: Date;
    readonly audit: { readonly requestId?: string };
  }): Promise<CandidateReviewMutationResult> {
    return this.serializable(async (transaction) => {
      await this.assertAdministrator(transaction, input.authorization);
      const candidate = await this.requirePendingCandidate(
        transaction,
        input.candidateId,
        input.expectedVersion,
      );
      const unresolvedDuplicateCount = await this.synchronizeDuplicateMatches(
        transaction,
        candidate,
      );
      const updated = await transaction.listingImportCandidate.update({
        where: { id: candidate.id },
        data: { version: { increment: 1 }, updatedAt: input.now },
      });
      await transaction.auditEntry.create({
        data: {
          actorUserId: input.authorization.actor.userId,
          action: "LISTING_IMPORT_CANDIDATE_UPDATED",
          targetType: "LISTING_IMPORT_CANDIDATE",
          targetId: candidate.id,
          requestId: input.audit.requestId ?? null,
          metadata: {
            candidateId: candidate.id,
            version: updated.version,
            changedFields: ["duplicateMatches"],
            unresolvedDuplicateCount,
          },
        },
      });
      return {
        candidateId: candidate.id,
        version: updated.version,
        status: updated.status,
        unresolvedDuplicateCount,
      };
    });
  }

  async resolveCandidateDuplicate(
    input: ResolveCandidateDuplicateCommand,
  ): Promise<DuplicateResolutionResult> {
    return this.serializable(async (transaction) => {
      await this.assertAdministrator(transaction, input.authorization);
      const candidate = await this.requirePendingCandidate(
        transaction,
        input.candidateId,
        input.expectedVersion,
      );
      const requestedMatch = await transaction.listingDuplicateMatch.findFirst({
        where: { id: input.matchId, candidateId: candidate.id },
        select: { id: true },
      });
      await this.synchronizeDuplicateMatches(transaction, candidate);
      const match = await transaction.listingDuplicateMatch.findFirst({
        where: {
          id: input.matchId,
          candidateId: candidate.id,
          resolution: "UNRESOLVED",
        },
        select: { id: true, eventId: true, externalListingId: true },
      });
      if (!match) {
        throw new ListingImportReviewError(
          requestedMatch
            ? "DUPLICATE_NO_LONGER_CURRENT"
            : "DUPLICATE_MATCH_NOT_FOUND",
          requestedMatch ? 409 : 404,
          requestedMatch
            ? "This duplicate decision has already changed. Refresh and try again."
            : "The duplicate match was not found.",
        );
      }
      if (input.resolution === "LINKED") {
        await this.assertLinkTargetCurrent(transaction, match);
      }
      await transaction.listingDuplicateMatch.update({
        where: { id: match.id },
        data: {
          resolution: input.resolution,
          resolvedByUserId: input.authorization.actor.userId,
          resolvedAt: input.now,
        },
      });

      let updated;
      if (input.resolution === "LINKED") {
        await transaction.listingDuplicateMatch.deleteMany({
          where: {
            candidateId: candidate.id,
            resolution: "UNRESOLVED",
            id: { not: match.id },
          },
        });
        await transaction.listingSourceRecord.update({
          where: { id: candidate.sourceRecordId },
          data: match.eventId
            ? { linkedEventId: match.eventId }
            : { linkedExternalListingId: match.externalListingId! },
        });
        updated = await transaction.listingImportCandidate.update({
          where: { id: candidate.id },
          data: {
            status: "DUPLICATE_LINKED",
            version: { increment: 1 },
            reviewedByUserId: input.authorization.actor.userId,
            reviewedAt: input.now,
            reviewReason: match.eventId
              ? "Linked to an existing organizer listing."
              : "Linked to an existing external listing.",
            updatedAt: input.now,
          },
        });
      } else {
        updated = await transaction.listingImportCandidate.update({
          where: { id: candidate.id },
          data: { version: { increment: 1 }, updatedAt: input.now },
        });
      }
      const unresolvedDuplicateCount =
        await transaction.listingDuplicateMatch.count({
          where: { candidateId: candidate.id, resolution: "UNRESOLVED" },
        });
      await transaction.auditEntry.create({
        data: {
          actorUserId: input.authorization.actor.userId,
          action: "LISTING_IMPORT_DUPLICATE_RESOLVED",
          targetType: "LISTING_IMPORT_CANDIDATE",
          targetId: candidate.id,
          requestId: input.audit.requestId ?? null,
          metadata: {
            candidateId: candidate.id,
            matchId: match.id,
            resolution: input.resolution,
            targetType: match.eventId ? "EVENT" : "EXTERNAL_LISTING",
            targetId: match.eventId ?? match.externalListingId,
            version: updated.version,
          },
        },
      });
      return {
        candidateId: candidate.id,
        matchId: match.id,
        resolution: input.resolution,
        version: updated.version,
        status: updated.status,
        unresolvedDuplicateCount,
      };
    });
  }

  async approveCandidate(input: {
    readonly candidateId: string;
    readonly expectedVersion: number;
    readonly authorization: ListingImportReviewAuthorization;
    readonly now: Date;
    readonly audit: { readonly requestId?: string };
  }): Promise<ApprovedExternalListingResult> {
    for (let attempt = 1; attempt <= MAX_PUBLIC_ID_ATTEMPTS; attempt += 1) {
      try {
        const publicId = this.publicIdFactory();
        if (!/^[0-9a-f]{12}$/u.test(publicId)) {
          throw new ListingImportReviewError(
            "PUBLIC_ID_ALLOCATION_FAILED",
            503,
            "A public listing identifier could not be allocated.",
          );
        }
        const outcome = await this.prisma.$transaction(
          (transaction) => this.approveOnce(transaction, input, publicId),
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            timeout: TRANSACTION_TIMEOUT_MILLISECONDS,
          },
        );
        if (outcome.status === "BLOCKED") {
          throw new ListingImportReviewError(
            "UNRESOLVED_DUPLICATES",
            409,
            "Resolve all probable duplicate matches before approval.",
          );
        }
        return outcome.result;
      } catch (error) {
        if (
          attempt < MAX_PUBLIC_ID_ATTEMPTS &&
          (isRetryableTransactionError(error) || isUniqueConflict(error))
        ) {
          continue;
        }
        if (isUniqueConflict(error)) {
          throw new ListingImportReviewError(
            "PUBLIC_ID_ALLOCATION_FAILED",
            503,
            "A unique public listing identifier could not be allocated.",
            { cause: error },
          );
        }
        throw error;
      }
    }
    throw new ListingImportReviewError(
      "PUBLIC_ID_ALLOCATION_FAILED",
      503,
      "A unique public listing identifier could not be allocated.",
    );
  }

  private async approveOnce(
    transaction: Transaction,
    input: {
      readonly candidateId: string;
      readonly expectedVersion: number;
      readonly authorization: ListingImportReviewAuthorization;
      readonly now: Date;
      readonly audit: { readonly requestId?: string };
    },
    publicId: string,
  ): Promise<ApprovalOutcome> {
    await this.assertAdministrator(transaction, input.authorization);
    const candidate = await this.requirePendingCandidate(
      transaction,
      input.candidateId,
      input.expectedVersion,
    );
    const payload = parsedPayload(candidate.currentPayload);
    let normalized;
    try {
      normalized = normalizeReviewedListingContent({
        eventType: payload.eventType,
        title: payload.title,
        description: payload.description,
        localStartsAt: payload.localStartsAt,
        localEndsAt: payload.localEndsAt,
        timezone: payload.timezone,
        privacyMode: payload.privacyMode,
        addressLine1: payload.addressLine1,
        addressLine2: payload.addressLine2,
        city: payload.city,
        region: payload.region,
        postalCode: payload.postalCode,
        countryCode: payload.countryCode,
      });
    } catch (cause) {
      throw new ListingImportReviewError(
        "INVALID_CANDIDATE_CONTENT",
        422,
        "The candidate content is not valid for publication.",
        { cause },
      );
    }
    if (
      normalized.startsAt.getTime() !== candidate.startsAt.getTime() ||
      normalized.endsAt.getTime() !== candidate.endsAt.getTime() ||
      normalized.normalizedTitle !== candidate.normalizedTitle ||
      candidate.locationConfirmationStatus !== "CONFIRMED" ||
      candidate.latitude === null ||
      candidate.longitude === null ||
      !candidate.locationProviderPlaceId ||
      !candidate.locationProviderName ||
      !payload.addressLine1 ||
      !payload.locationResolution
    ) {
      throw new ListingImportReviewError(
        candidate.locationConfirmationStatus !== "CONFIRMED"
          ? "LOCATION_REQUIRED"
          : "INVALID_CANDIDATE_CONTENT",
        422,
        "The candidate requires valid content and a confirmed location.",
      );
    }
    const unresolvedDuplicateCount = await this.synchronizeDuplicateMatches(
      transaction,
      candidate,
    );
    if (unresolvedDuplicateCount > 0) {
      return { status: "BLOCKED", unresolvedDuplicateCount };
    }

    const listingId = randomUUID();
    const slug = eventSlug(payload.title);
    const canonicalPath = futurePublicPath({
      eventType: payload.eventType,
      slug,
      publicId,
    });
    const approved = await transaction.listingImportCandidate.update({
      where: { id: candidate.id },
      data: {
        status: "APPROVED",
        version: { increment: 1 },
        reviewedByUserId: input.authorization.actor.userId,
        reviewedAt: input.now,
        reviewReason: null,
        updatedAt: input.now,
      },
    });
    const listing = await transaction.externalListing.create({
      data: {
        id: listingId,
        candidateId: candidate.id,
        primarySourceRecordId: candidate.sourceRecordId,
        publicId,
        slug,
        canonicalPath,
        eventType: payload.eventType,
        title: payload.title,
        description: payload.description,
        localStartsAt: payload.localStartsAt,
        localEndsAt: payload.localEndsAt,
        startsAt: candidate.startsAt,
        endsAt: candidate.endsAt,
        timezone: payload.timezone,
        privacyMode: payload.privacyMode,
        status: "PUBLISHED",
        version: 1,
        attribution: {
          schema: "external-listing-attribution.v1",
          sourceId: candidate.sourceRecord.source.id,
          sourceKey: candidate.sourceRecord.source.key,
          sourceName: candidate.sourceRecord.source.name,
          sourceListingId: candidate.sourceRecord.sourceListingId,
          sourceUrl: candidate.sourceRecord.canonicalSourceUrl,
        },
        publishedAt: input.now,
        createdAt: input.now,
        updatedAt: input.now,
      },
    });
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO "external_listing_locations" (
        "id", "listing_id", "address_line_1", "address_line_2", "city",
        "region", "postal_code", "country_code", "normalized_address",
        "latitude", "longitude", "coordinates", "timezone",
        "provider_place_id", "provider_name", "provider_version",
        "provider_attribution", "resolution_source", "confirmation_status",
        "confirmed_by_user_id", "confirmed_at", "public_zone", "precision",
        "confidence", "validation_status", "created_at", "updated_at"
      ) VALUES (
        ${randomUUID()}::uuid,
        ${listing.id}::uuid,
        ${payload.addressLine1},
        ${payload.addressLine2},
        ${payload.city},
        ${payload.region},
        ${payload.postalCode},
        ${payload.countryCode},
        ${payload.normalizedAddress},
        ${Number(candidate.latitude)},
        ${Number(candidate.longitude)},
        ST_SetSRID(
          ST_MakePoint(${Number(candidate.longitude)}, ${Number(candidate.latitude)}),
          4326
        )::geography,
        ${payload.timezone},
        ${candidate.locationProviderPlaceId},
        ${candidate.locationProviderName},
        ${candidate.locationProviderVersion},
        ${candidate.locationProviderAttribution},
        'ADMIN_GEOCODING',
        'CONFIRMED',
        ${input.authorization.actor.userId}::uuid,
        ${candidate.locationConfirmedAt ?? input.now},
        'bakersfield',
        ${payload.locationResolution.precision},
        ${payload.locationResolution.confidence},
        CAST(${payload.locationResolution.validationStatus} AS "location_validation_status"),
        ${input.now},
        ${input.now}
      )
    `);
    await transaction.auditEntry.create({
      data: {
        actorUserId: input.authorization.actor.userId,
        action: "LISTING_IMPORT_CANDIDATE_APPROVED",
        targetType: "LISTING_IMPORT_CANDIDATE",
        targetId: candidate.id,
        requestId: input.audit.requestId ?? null,
        metadata: {
          candidateId: candidate.id,
          sourceRecordId: candidate.sourceRecordId,
          externalListingId: listing.id,
          publicId,
          candidateVersion: approved.version,
          listingVersion: listing.version,
        },
      },
    });
    return {
      status: "APPROVED",
      result: {
        candidateId: candidate.id,
        version: approved.version,
        status: "APPROVED",
        unresolvedDuplicateCount: 0,
        listingId: listing.id,
        listingVersion: listing.version,
        publicId,
        canonicalPath,
      },
    };
  }

  private async terminalCandidateDecision(
    input: {
      readonly candidateId: string;
      readonly expectedVersion: number;
      readonly reason: string;
      readonly authorization: ListingImportReviewAuthorization;
      readonly now: Date;
      readonly audit: { readonly requestId?: string };
    },
    status: "REJECTED" | "DELETED",
    confirmation?: string,
  ): Promise<CandidateReviewMutationResult> {
    return this.serializable(async (transaction) => {
      await this.assertAdministrator(transaction, input.authorization);
      const candidate = await this.requirePendingCandidate(
        transaction,
        input.candidateId,
        input.expectedVersion,
      );
      if (status === "DELETED") {
        const title = parsedPayload(candidate.currentPayload).title;
        if (confirmation !== "DELETE" && confirmation !== title) {
          throw new ListingImportReviewError(
            "INVALID_CONFIRMATION",
            409,
            "Enter the exact candidate title or DELETE.",
          );
        }
      }
      const updated = await transaction.listingImportCandidate.update({
        where: { id: candidate.id },
        data: {
          status,
          version: { increment: 1 },
          reviewedByUserId: input.authorization.actor.userId,
          reviewedAt: input.now,
          reviewReason: input.reason,
          updatedAt: input.now,
        },
      });
      const unresolvedDuplicateCount =
        await transaction.listingDuplicateMatch.count({
          where: { candidateId: candidate.id, resolution: "UNRESOLVED" },
        });
      await transaction.auditEntry.create({
        data: {
          actorUserId: input.authorization.actor.userId,
          action:
            status === "REJECTED"
              ? "LISTING_IMPORT_CANDIDATE_REJECTED"
              : "LISTING_IMPORT_CANDIDATE_DELETED",
          targetType: "LISTING_IMPORT_CANDIDATE",
          targetId: candidate.id,
          requestId: input.audit.requestId ?? null,
          metadata: {
            candidateId: candidate.id,
            version: updated.version,
            reasonDigest: reasonDigest(input.reason),
          },
        },
      });
      return {
        candidateId: candidate.id,
        version: updated.version,
        status: updated.status,
        unresolvedDuplicateCount,
      };
    });
  }

  async rejectCandidate(input: {
    readonly candidateId: string;
    readonly expectedVersion: number;
    readonly reason: string;
    readonly authorization: ListingImportReviewAuthorization;
    readonly now: Date;
    readonly audit: { readonly requestId?: string };
  }): Promise<CandidateReviewMutationResult> {
    return this.terminalCandidateDecision(input, "REJECTED");
  }

  async deleteCandidate(
    input: DeleteCandidateCommand,
  ): Promise<CandidateReviewMutationResult> {
    return this.terminalCandidateDecision(input, "DELETED", input.confirmation);
  }

  async editExternalListing(
    input: ExternalListingEditCommand,
  ): Promise<ExternalListingMutationResult> {
    return this.serializable(async (transaction) => {
      await this.assertAdministrator(transaction, input.authorization);
      await transaction.$queryRaw(Prisma.sql`
        SELECT "id"
        FROM "external_listings"
        WHERE "id" = ${input.listingId}::uuid
        FOR UPDATE
      `);
      const listing = await transaction.externalListing.findUnique({
        where: { id: input.listingId },
        include: { location: { select: { timezone: true } } },
      });
      if (!listing) {
        throw new ListingImportReviewError(
          "EXTERNAL_LISTING_NOT_FOUND",
          404,
          "The external listing was not found.",
        );
      }
      if (listing.status !== "PUBLISHED") {
        throw new ListingImportReviewError(
          "INVALID_LIFECYCLE",
          409,
          "Expired or removed external listings cannot be edited.",
        );
      }
      if (listing.version !== input.expectedVersion) throw reviewStaleVersion();
      if (
        !listing.location ||
        listing.location.timezone !== input.content.timezone
      ) {
        throw new ListingImportReviewError(
          "INVALID_CANDIDATE_CONTENT",
          422,
          "The listing schedule timezone must match its confirmed location.",
        );
      }
      const slug = eventSlug(input.content.title);
      const canonicalPath = futurePublicPath({
        eventType: input.content.eventType,
        slug,
        publicId: listing.publicId,
      });
      const changedFields = [
        ["eventType", listing.eventType, input.content.eventType],
        ["title", listing.title, input.content.title],
        ["description", listing.description, input.content.description],
        ["localStartsAt", listing.localStartsAt, input.content.localStartsAt],
        ["localEndsAt", listing.localEndsAt, input.content.localEndsAt],
        ["timezone", listing.timezone, input.content.timezone],
        ["privacyMode", listing.privacyMode, input.content.privacyMode],
      ]
        .filter(([, current, next]) => current !== next)
        .map(([field]) => field!);
      const updated = await transaction.externalListing.update({
        where: { id: listing.id },
        data: {
          eventType: input.content.eventType,
          title: input.content.title,
          description: input.content.description,
          localStartsAt: input.content.localStartsAt,
          localEndsAt: input.content.localEndsAt,
          startsAt: input.content.startsAt,
          endsAt: input.content.endsAt,
          timezone: input.content.timezone,
          privacyMode: input.content.privacyMode,
          slug,
          canonicalPath,
          version: { increment: 1 },
          updatedAt: input.now,
        },
      });
      await transaction.auditEntry.create({
        data: {
          actorUserId: input.authorization.actor.userId,
          action: "EXTERNAL_LISTING_EDITED",
          targetType: "EXTERNAL_LISTING",
          targetId: listing.id,
          requestId: input.audit.requestId ?? null,
          metadata: {
            externalListingId: listing.id,
            version: updated.version,
            changedFields,
          },
        },
      });
      return {
        listingId: listing.id,
        version: updated.version,
        status: updated.status,
        canonicalPath: updated.canonicalPath,
        previousCanonicalPath: listing.canonicalPath,
      };
    });
  }

  async removeExternalListing(
    input: ExternalListingRemovalCommand,
  ): Promise<ExternalListingMutationResult> {
    return this.serializable(async (transaction) => {
      await this.assertAdministrator(transaction, input.authorization);
      await transaction.$queryRaw(Prisma.sql`
        SELECT "id"
        FROM "external_listings"
        WHERE "id" = ${input.listingId}::uuid
        FOR UPDATE
      `);
      const listing = await transaction.externalListing.findUnique({
        where: { id: input.listingId },
      });
      if (!listing) {
        throw new ListingImportReviewError(
          "EXTERNAL_LISTING_NOT_FOUND",
          404,
          "The external listing was not found.",
        );
      }
      if (
        input.confirmation !== "REMOVE" &&
        input.confirmation !== listing.title
      ) {
        throw new ListingImportReviewError(
          "INVALID_CONFIRMATION",
          409,
          "Enter the exact listing title or REMOVE.",
        );
      }
      if (listing.status === "REMOVED") {
        return {
          listingId: listing.id,
          version: listing.version,
          status: listing.status,
          canonicalPath: listing.canonicalPath,
          previousCanonicalPath: listing.canonicalPath,
          idempotent: true,
        };
      }
      if (listing.status !== "PUBLISHED") {
        throw new ListingImportReviewError(
          "INVALID_LIFECYCLE",
          409,
          "Expired external listings are terminal.",
        );
      }
      if (listing.version !== input.expectedVersion) throw reviewStaleVersion();
      const updated = await transaction.externalListing.update({
        where: { id: listing.id },
        data: {
          status: "REMOVED",
          removedAt: input.now,
          removalReason: input.reason,
          expiredAt: null,
          version: { increment: 1 },
          updatedAt: input.now,
        },
      });
      await transaction.auditEntry.create({
        data: {
          actorUserId: input.authorization.actor.userId,
          action: "EXTERNAL_LISTING_REMOVED",
          targetType: "EXTERNAL_LISTING",
          targetId: listing.id,
          requestId: input.audit.requestId ?? null,
          metadata: {
            externalListingId: listing.id,
            version: updated.version,
            reasonDigest: reasonDigest(input.reason),
          },
        },
      });
      return {
        listingId: listing.id,
        version: updated.version,
        status: updated.status,
        canonicalPath: updated.canonicalPath,
        previousCanonicalPath: listing.canonicalPath,
        idempotent: false,
      };
    });
  }
}
