import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { PrismaClient } from "@/generated/prisma/client";
import type { LocationProvider } from "@/modules/locations/application/location-provider";
import type {
  LocationInput,
  ValidatedLocation,
} from "@/modules/locations/domain/types";
import { listingContentHash } from "@/modules/listing-imports/application/content-hash";
import { ListingImportReviewService } from "@/modules/listing-imports/application/listing-import-review-service";
import { ListingImportService } from "@/modules/listing-imports/application/listing-import-service";
import type { ListingImportReviewActor } from "@/modules/listing-imports/application/review-ports";
import { normalizeListingContent } from "@/modules/listing-imports/domain/normalization";
import { PrismaListingImportRepository } from "@/modules/listing-imports/infrastructure/prisma-listing-import-repository";
import {
  PrismaListingImportReviewRepository,
  type ListingImportReviewRepositoryHooks,
} from "@/modules/listing-imports/infrastructure/prisma-listing-import-review-repository";

import { testEmail, testRunId } from "./test-run";

export interface ReviewFixtureContent {
  readonly eventType: "ESTATE_SALE";
  readonly title: string;
  readonly description: string;
  readonly localStartsAt: string;
  readonly localEndsAt: string;
  readonly timezone: "America/Los_Angeles";
  readonly addressLine1: string;
  readonly addressLine2: null;
  readonly city: "Bakersfield";
  readonly region: "CA";
  readonly postalCode: "93301";
  readonly countryCode: "US";
  readonly privacyMode: "APPROXIMATE_LOCATION";
}

export interface ReviewFixture {
  readonly sourceListingId: string;
  readonly sourceUrl: string;
  readonly content: ReviewFixtureContent;
  readonly normalized: ReturnType<typeof normalizeListingContent>;
}

export interface CreatedReviewCandidate {
  readonly batchId: string;
  readonly candidateId: string;
}

export class ReviewFixtureLocationProvider implements LocationProvider {
  validate(input: LocationInput): Promise<ValidatedLocation> {
    return Promise.resolve({
      ...input,
      normalizedAddress: `${input.addressLine1}, ${input.city}, ${input.region} ${input.postalCode}, ${input.countryCode}`,
      latitude: 35.373292,
      longitude: -119.018712,
      providerPlaceId: `finding-six-${input.postalCode}`,
      providerName: "integration-fixture",
      precision: "exact",
      confidence: 1,
      validationStatus: "VERIFIED",
    });
  }
}

interface ReviewServiceOptions {
  readonly hooks?: ListingImportReviewRepositoryHooks;
  readonly locationProvider?: LocationProvider;
  readonly prisma?: PrismaClient;
  readonly publicIdFactory?: () => string;
}

interface NextFixtureOptions {
  readonly calendarDate?: string;
  readonly content?: Partial<ReviewFixtureContent>;
}

interface HarnessOptions {
  readonly baseCalendarDate?: string;
  readonly importClock?: () => Date;
  readonly reviewClock?: () => Date;
}

export class ListingImportReviewHarness {
  readonly reviews: ListingImportReviewService;

  private readonly imports: ListingImportService;
  private fixtureSequence = 0;

  constructor(
    readonly prisma: PrismaClient,
    readonly administratorId: string,
    readonly administratorSessionId: string,
    private readonly options: HarnessOptions = {},
  ) {
    this.imports = new ListingImportService(
      new PrismaListingImportRepository(prisma, options.importClock),
      "test",
    );
    this.reviews = this.createReviewService();
  }

  identifier(label: string): string {
    return `${testRunId().slice(0, 24)}-${label.slice(0, 24)}-${randomUUID().slice(0, 8)}`;
  }

  actor(
    sessionId: string = this.administratorSessionId,
  ): ListingImportReviewActor {
    return { userId: this.administratorId, sessionId };
  }

  createReviewService(
    options: ReviewServiceOptions = {},
  ): ListingImportReviewService {
    const prisma = options.prisma ?? this.prisma;
    return new ListingImportReviewService(
      new PrismaListingImportReviewRepository(
        prisma,
        options.publicIdFactory ?? (() => randomBytes(6).toString("hex")),
        options.hooks ?? {},
      ),
      options.locationProvider ?? new ReviewFixtureLocationProvider(),
      this.options.reviewClock,
    );
  }

  nextFixture(label: string, options: NextFixtureOptions = {}): ReviewFixture {
    this.fixtureSequence += 1;
    const base = new Date(
      `${this.options.baseCalendarDate ?? "2095-01-01"}T00:00:00.000Z`,
    );
    base.setUTCDate(base.getUTCDate() + this.fixtureSequence * 3);
    const calendarDate =
      options.calendarDate ?? base.toISOString().slice(0, 10);
    const sourceListingId = this.identifier(label);
    const content: ReviewFixtureContent = {
      eventType: "ESTATE_SALE",
      title: `${label} Estate Sale ${String(this.fixtureSequence)}`,
      description:
        "A deterministic imported listing with furniture, books, art, and household goods for concurrency review.",
      localStartsAt: `${calendarDate}T09:00`,
      localEndsAt: `${calendarDate}T15:00`,
      timezone: "America/Los_Angeles",
      addressLine1: `${String(6000 + this.fixtureSequence)} Finding Avenue`,
      addressLine2: null,
      city: "Bakersfield",
      region: "CA",
      postalCode: "93301",
      countryCode: "US",
      privacyMode: "APPROXIMATE_LOCATION",
      ...options.content,
    };
    return {
      sourceListingId,
      sourceUrl: `https://fixture.invalid/listings/${sourceListingId}`,
      content,
      normalized: normalizeListingContent(content),
    };
  }

  candidateEditInput(
    fixture: ReviewFixture,
    expectedVersion: number,
    title: string = fixture.content.title,
  ) {
    return { expectedVersion, ...fixture.content, title };
  }

  externalEditInput(
    fixture: ReviewFixture,
    expectedVersion: number,
    title: string,
  ) {
    const { content } = fixture;
    return {
      expectedVersion,
      eventType: content.eventType,
      title,
      description: content.description,
      localStartsAt: content.localStartsAt,
      localEndsAt: content.localEndsAt,
      timezone: content.timezone,
      privacyMode: content.privacyMode,
    };
  }

  async createCandidate(
    fixture: ReviewFixture,
  ): Promise<CreatedReviewCandidate> {
    const result = await this.imports.importBatch(
      {
        contractVersion: "listing-import.v1",
        sourceKey: "fixture",
        ingestorRunId: this.identifier("finding-six-run"),
        ingestorInstanceId: this.identifier("finding-six-instance"),
        parserVersion: "finding-six-integration@1.0.0",
        items: [
          {
            sourceListingId: fixture.sourceListingId,
            sourceUrl: fixture.sourceUrl,
            retrievedAt: "2026-08-08T16:00:00.000Z",
            contentHash: listingContentHash(fixture.normalized),
            ...fixture.content,
          },
        ],
      },
      {
        transport: "MANUAL_JSON",
        actor: {
          kind: "ADMIN_USER",
          adminUserId: this.administratorId,
        },
        audit: { requestId: this.identifier("finding-six-import") },
      },
    );
    const candidateId = result.rows[0]?.candidateId;
    if (!candidateId) {
      throw new Error("Finding 6 fixture did not create a review candidate.");
    }
    return { batchId: result.batchId, candidateId };
  }

  async confirmCandidate(
    candidateId: string,
    expectedVersion = 1,
    reviews: ListingImportReviewService = this.reviews,
    sessionId: string = this.administratorSessionId,
  ) {
    return reviews.confirmCandidateLocation(
      this.actor(sessionId),
      candidateId,
      { expectedVersion },
      { requestId: this.identifier("finding-six-confirm") },
    );
  }

  async createSession(): Promise<string> {
    const now = new Date();
    const session = await this.prisma.session.create({
      data: {
        userId: this.administratorId,
        tokenHash: createHash("sha256")
          .update(this.identifier("finding-six-session"), "utf8")
          .digest("hex"),
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
        passwordAuthenticatedAt: now,
      },
      select: { id: true },
    });
    return session.id;
  }
}

export async function createListingImportReviewHarness(
  prisma: PrismaClient,
  options: HarnessOptions = {},
): Promise<ListingImportReviewHarness> {
  const existingAdministrator = await prisma.user.findFirst({
    where: {
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: { not: null },
    },
    select: { id: true },
  });
  const administrator =
    existingAdministrator ??
    (await (async () => {
      const email = testEmail("finding-six-admin");
      return prisma.user.create({
        data: {
          displayName: "Finding Six Integration Administrator",
          email,
          normalizedEmail: email,
          passwordHash: "integration-test-password-hash",
          emailVerifiedAt: new Date(),
          role: "SUPER_ADMIN",
        },
        select: { id: true },
      });
    })());
  const now = new Date();
  const session = await prisma.session.create({
    data: {
      userId: administrator.id,
      tokenHash: createHash("sha256")
        .update(`${testRunId()}-${randomUUID()}`, "utf8")
        .digest("hex"),
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      passwordAuthenticatedAt: now,
    },
    select: { id: true },
  });
  return new ListingImportReviewHarness(
    prisma,
    administrator.id,
    session.id,
    options,
  );
}
