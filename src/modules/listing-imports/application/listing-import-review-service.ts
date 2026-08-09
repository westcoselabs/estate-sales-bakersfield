import type { LocationProvider } from "@/modules/locations";

import {
  externalListingRevalidationPaths,
  type ExternalListingRevalidator,
} from "./external-listing-lifecycle";
import { ListingImportReviewError } from "./review-errors";
import type {
  ListingImportReviewActor,
  ListingImportReviewAuditContext,
  ListingImportReviewAuthorization,
  ListingImportReviewRepository,
} from "./review-ports";
import {
  candidateDeleteSchema,
  candidateEditSchema,
  candidateReviewDecisionSchema,
  duplicateResolutionSchema,
  expectedReviewVersionSchema,
  externalListingEditSchema,
  externalListingRemovalSchema,
  normalizeExternalListingContent,
  normalizeReviewedListingContent,
} from "./review-schemas";

function normalizedContent<T>(operation: () => T): T {
  try {
    return operation();
  } catch (cause) {
    if (cause instanceof ListingImportReviewError) throw cause;
    throw new ListingImportReviewError(
      "INVALID_CANDIDATE_CONTENT",
      422,
      "The reviewed listing content is invalid.",
      { cause },
    );
  }
}

type ExternalListingRevalidationOperation =
  "CANDIDATE_APPROVAL" | "EXTERNAL_LISTING_EDIT" | "EXTERNAL_LISTING_REMOVAL";

export interface ExternalListingRevalidationFailure {
  readonly operation: ExternalListingRevalidationOperation;
  readonly listingId: string;
  readonly paths: readonly string[];
  readonly errorType: string;
}

export type ExternalListingRevalidationFailureReporter = (
  failure: ExternalListingRevalidationFailure,
) => void;

export class ListingImportReviewService {
  constructor(
    private readonly reviews: ListingImportReviewRepository,
    private readonly locations: LocationProvider,
    private readonly clock: () => Date = () => new Date(),
    private readonly revalidator: ExternalListingRevalidator = {
      revalidate: () => undefined,
    },
    private readonly reportRevalidationFailure: ExternalListingRevalidationFailureReporter = () =>
      undefined,
  ) {}

  private async revalidateCommittedListing(
    operation: ExternalListingRevalidationOperation,
    listingId: string,
    ...canonicalPaths: readonly (string | null | undefined)[]
  ): Promise<void> {
    const paths = externalListingRevalidationPaths(...canonicalPaths);
    try {
      await this.revalidator.revalidate(paths);
    } catch (error) {
      try {
        this.reportRevalidationFailure({
          operation,
          listingId,
          paths,
          errorType:
            error instanceof Error
              ? error.name.slice(0, 100) || "Error"
              : "UnknownError",
        });
      } catch {
        // Cache and reporting failures must not mask an already committed mutation.
      }
    }
  }

  private authorization(
    actor: ListingImportReviewActor,
    requireRecentSession: boolean,
  ): ListingImportReviewAuthorization {
    if (!actor.sessionId) {
      throw new ListingImportReviewError(
        "ACTOR_NOT_AUTHORIZED",
        403,
        requireRecentSession
          ? "Recent administrator authorization is required."
          : "An active administrator session is required.",
      );
    }
    return {
      actor,
      authorizationAt: this.clock(),
      requireRecentSession,
    };
  }

  async editCandidate(
    actor: ListingImportReviewActor,
    candidateId: string,
    value: unknown,
    audit: ListingImportReviewAuditContext = {},
  ) {
    const input = candidateEditSchema.parse(value);
    const { expectedVersion, ...contentInput } = input;
    const content = normalizedContent(() =>
      normalizeReviewedListingContent(contentInput),
    );
    const now = this.clock();
    return this.reviews.editCandidate({
      candidateId,
      expectedVersion,
      content,
      authorization: this.authorization(actor, false),
      now,
      audit,
    });
  }

  async confirmCandidateLocation(
    actor: ListingImportReviewActor,
    candidateId: string,
    value: unknown,
    audit: ListingImportReviewAuditContext = {},
  ) {
    const { expectedVersion } = expectedReviewVersionSchema.parse(value);
    const initialAuthorization = this.authorization(actor, false);
    const expectedLocationInput = await this.reviews.candidateLocationInput({
      candidateId,
      expectedVersion,
      authorization: initialAuthorization,
    });
    const location = await this.locations.validate(expectedLocationInput);
    const now = this.clock();
    return this.reviews.confirmCandidateLocation({
      candidateId,
      expectedVersion,
      expectedLocationInput,
      location,
      authorization: this.authorization(actor, false),
      now,
      audit,
    });
  }

  async recomputeCandidateDuplicates(
    actor: ListingImportReviewActor,
    candidateId: string,
    value: unknown,
    audit: ListingImportReviewAuditContext = {},
  ) {
    const { expectedVersion } = expectedReviewVersionSchema.parse(value);
    const now = this.clock();
    return this.reviews.recomputeCandidateDuplicates({
      candidateId,
      expectedVersion,
      authorization: this.authorization(actor, false),
      now,
      audit,
    });
  }

  async resolveCandidateDuplicate(
    actor: ListingImportReviewActor,
    candidateId: string,
    matchId: string,
    value: unknown,
    audit: ListingImportReviewAuditContext = {},
  ) {
    const input = duplicateResolutionSchema.parse(value);
    const now = this.clock();
    return this.reviews.resolveCandidateDuplicate({
      candidateId,
      matchId,
      expectedVersion: input.expectedVersion,
      resolution: input.resolution,
      authorization: this.authorization(actor, input.resolution === "LINKED"),
      now,
      audit,
    });
  }

  async approveCandidate(
    actor: ListingImportReviewActor,
    candidateId: string,
    value: unknown,
    audit: ListingImportReviewAuditContext = {},
  ) {
    const { expectedVersion } = expectedReviewVersionSchema.parse(value);
    const now = this.clock();
    const result = await this.reviews.approveCandidate({
      candidateId,
      expectedVersion,
      authorization: this.authorization(actor, true),
      now,
      audit,
    });
    await this.revalidateCommittedListing(
      "CANDIDATE_APPROVAL",
      result.listingId,
      result.canonicalPath,
    );
    return result;
  }

  async rejectCandidate(
    actor: ListingImportReviewActor,
    candidateId: string,
    value: unknown,
    audit: ListingImportReviewAuditContext = {},
  ) {
    const input = candidateReviewDecisionSchema.parse(value);
    const now = this.clock();
    return this.reviews.rejectCandidate({
      candidateId,
      ...input,
      authorization: this.authorization(actor, true),
      now,
      audit,
    });
  }

  async deleteCandidate(
    actor: ListingImportReviewActor,
    candidateId: string,
    value: unknown,
    audit: ListingImportReviewAuditContext = {},
  ) {
    const input = candidateDeleteSchema.parse(value);
    const now = this.clock();
    return this.reviews.deleteCandidate({
      candidateId,
      ...input,
      authorization: this.authorization(actor, true),
      now,
      audit,
    });
  }

  async editExternalListing(
    actor: ListingImportReviewActor,
    listingId: string,
    value: unknown,
    audit: ListingImportReviewAuditContext = {},
  ) {
    const input = externalListingEditSchema.parse(value);
    const { expectedVersion, ...contentInput } = input;
    const content = normalizedContent(() =>
      normalizeExternalListingContent(contentInput),
    );
    const now = this.clock();
    const result = await this.reviews.editExternalListing({
      listingId,
      expectedVersion,
      content,
      authorization: this.authorization(actor, false),
      now,
      audit,
    });
    await this.revalidateCommittedListing(
      "EXTERNAL_LISTING_EDIT",
      result.listingId,
      result.previousCanonicalPath,
      result.canonicalPath,
    );
    return result;
  }

  async removeExternalListing(
    actor: ListingImportReviewActor,
    listingId: string,
    value: unknown,
    audit: ListingImportReviewAuditContext = {},
  ) {
    const input = externalListingRemovalSchema.parse(value);
    const now = this.clock();
    const result = await this.reviews.removeExternalListing({
      listingId,
      ...input,
      authorization: this.authorization(actor, true),
      now,
      audit,
    });
    await this.revalidateCommittedListing(
      "EXTERNAL_LISTING_REMOVAL",
      result.listingId,
      result.canonicalPath,
    );
    return result;
  }
}
