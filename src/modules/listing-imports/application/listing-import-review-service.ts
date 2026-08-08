import type { LocationProvider } from "@/modules/locations";

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

export class ListingImportReviewService {
  constructor(
    private readonly reviews: ListingImportReviewRepository,
    private readonly locations: LocationProvider,
    private readonly clock: () => Date = () => new Date(),
  ) {}

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
    return this.reviews.approveCandidate({
      candidateId,
      expectedVersion,
      authorization: this.authorization(actor, true),
      now,
      audit,
    });
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
    return this.reviews.editExternalListing({
      listingId,
      expectedVersion,
      content,
      authorization: this.authorization(actor, false),
      now,
      audit,
    });
  }

  async removeExternalListing(
    actor: ListingImportReviewActor,
    listingId: string,
    value: unknown,
    audit: ListingImportReviewAuditContext = {},
  ) {
    const input = externalListingRemovalSchema.parse(value);
    const now = this.clock();
    return this.reviews.removeExternalListing({
      listingId,
      ...input,
      authorization: this.authorization(actor, true),
      now,
      audit,
    });
  }
}
