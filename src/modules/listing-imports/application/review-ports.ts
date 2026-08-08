import type { ValidatedLocation } from "@/modules/locations";

import type {
  NormalizedReviewedListingContent,
  ReviewedCandidatePayload,
} from "./review-schemas";

export interface ListingImportReviewActor {
  readonly userId: string;
  readonly sessionId?: string;
}

export interface ListingImportReviewAuditContext {
  readonly requestId?: string;
}

export interface ListingImportReviewAuthorization {
  readonly actor: ListingImportReviewActor;
  readonly authorizationAt: Date;
  readonly requireRecentSession: boolean;
}

export interface CandidateLocationInput {
  readonly addressLine1: string;
  readonly addressLine2: string | null;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string;
  readonly countryCode: string;
  readonly timezone: string;
}

export interface CandidateReviewMutationResult {
  readonly candidateId: string;
  readonly version: number;
  readonly status:
    "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "DUPLICATE_LINKED" | "DELETED";
  readonly unresolvedDuplicateCount: number;
}

export interface DuplicateResolutionResult extends CandidateReviewMutationResult {
  readonly matchId: string;
  readonly resolution: "NOT_DUPLICATE" | "LINKED";
}

export interface ApprovedExternalListingResult extends CandidateReviewMutationResult {
  readonly status: "APPROVED";
  readonly listingId: string;
  readonly listingVersion: number;
  readonly publicId: string;
  readonly canonicalPath: string;
}

export interface ExternalListingMutationResult {
  readonly listingId: string;
  readonly version: number;
  readonly status: "PUBLISHED" | "EXPIRED" | "REMOVED";
  readonly canonicalPath: string;
  readonly previousCanonicalPath: string;
  readonly idempotent?: boolean;
}

interface CandidateCommandBase {
  readonly candidateId: string;
  readonly expectedVersion: number;
  readonly authorization: ListingImportReviewAuthorization;
  readonly now: Date;
  readonly audit: ListingImportReviewAuditContext;
}

export interface EditCandidateCommand extends CandidateCommandBase {
  readonly content: NormalizedReviewedListingContent;
}

export interface ConfirmCandidateLocationCommand extends CandidateCommandBase {
  readonly expectedLocationInput: CandidateLocationInput;
  readonly location: ValidatedLocation;
}

export interface ResolveCandidateDuplicateCommand extends CandidateCommandBase {
  readonly matchId: string;
  readonly resolution: "NOT_DUPLICATE" | "LINKED";
}

export interface CandidateDecisionCommand extends CandidateCommandBase {
  readonly reason: string;
}

export interface DeleteCandidateCommand extends CandidateDecisionCommand {
  readonly confirmation: string;
}

export interface ExternalListingEditCommand {
  readonly listingId: string;
  readonly expectedVersion: number;
  readonly content: Omit<
    NormalizedReviewedListingContent,
    | "addressLine1"
    | "addressLine2"
    | "city"
    | "region"
    | "postalCode"
    | "countryCode"
    | "normalizedAddress"
    | "normalizedCity"
    | "normalizedPostalCode"
  >;
  readonly authorization: ListingImportReviewAuthorization;
  readonly now: Date;
  readonly audit: ListingImportReviewAuditContext;
}

export interface ExternalListingRemovalCommand {
  readonly listingId: string;
  readonly expectedVersion: number;
  readonly reason: string;
  readonly confirmation: string;
  readonly authorization: ListingImportReviewAuthorization;
  readonly now: Date;
  readonly audit: ListingImportReviewAuditContext;
}

export interface ListingImportReviewRepository {
  candidateLocationInput(input: {
    readonly candidateId: string;
    readonly expectedVersion: number;
    readonly authorization: ListingImportReviewAuthorization;
  }): Promise<CandidateLocationInput>;

  editCandidate(
    input: EditCandidateCommand,
  ): Promise<CandidateReviewMutationResult>;

  confirmCandidateLocation(
    input: ConfirmCandidateLocationCommand,
  ): Promise<CandidateReviewMutationResult>;

  recomputeCandidateDuplicates(
    input: CandidateCommandBase,
  ): Promise<CandidateReviewMutationResult>;

  resolveCandidateDuplicate(
    input: ResolveCandidateDuplicateCommand,
  ): Promise<DuplicateResolutionResult>;

  approveCandidate(
    input: CandidateCommandBase,
  ): Promise<ApprovedExternalListingResult>;

  rejectCandidate(
    input: CandidateDecisionCommand,
  ): Promise<CandidateReviewMutationResult>;

  deleteCandidate(
    input: DeleteCandidateCommand,
  ): Promise<CandidateReviewMutationResult>;

  editExternalListing(
    input: ExternalListingEditCommand,
  ): Promise<ExternalListingMutationResult>;

  removeExternalListing(
    input: ExternalListingRemovalCommand,
  ): Promise<ExternalListingMutationResult>;
}

export interface CandidatePayloadReader {
  readonly payload: ReviewedCandidatePayload;
}
