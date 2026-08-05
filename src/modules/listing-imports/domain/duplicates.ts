import type {
  ListingDuplicateComparable,
  ListingIdentityDisposition,
  ListingIdentityObservation,
  ListingProbableDuplicateReason,
} from "./types";

const EARTH_RADIUS_METRES = 6_371_000;
const ONE_DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

export function schedulesOverlap(
  left: Pick<ListingDuplicateComparable, "startsAt" | "endsAt">,
  right: Pick<ListingDuplicateComparable, "startsAt" | "endsAt">,
): boolean {
  return left.startsAt < right.endsAt && right.startsAt < left.endsAt;
}

export function titleTokens(value: string): ReadonlySet<string> {
  return new Set(value.split(" ").filter((token) => token.length > 0));
}

export function jaccardSimilarity(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): number {
  if (left.size === 0 && right.size === 0) return 1;
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

export function distanceInMetres(
  left: { readonly latitude: number; readonly longitude: number },
  right: { readonly latitude: number; readonly longitude: number },
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const leftLatitude = radians(left.latitude);
  const rightLatitude = radians(right.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) *
      Math.cos(rightLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  const boundedHaversine = Math.min(1, Math.max(0, haversine));
  return (
    2 *
    EARTH_RADIUS_METRES *
    Math.atan2(Math.sqrt(boundedHaversine), Math.sqrt(1 - boundedHaversine))
  );
}

export function probableDuplicateReasons(
  candidate: ListingDuplicateComparable,
  target: ListingDuplicateComparable,
): readonly ListingProbableDuplicateReason[] {
  const reasons: ListingProbableDuplicateReason[] = [];
  const overlap = schedulesOverlap(candidate, target);
  const candidateTitleTokens = titleTokens(candidate.normalizedTitle);
  const targetTitleTokens = titleTokens(target.normalizedTitle);

  if (
    candidate.normalizedAddress.length > 0 &&
    candidate.normalizedAddress === target.normalizedAddress &&
    overlap
  ) {
    reasons.push("FULL_ADDRESS_SCHEDULE_OVERLAP");
  }

  if (
    candidate.normalizedPostalCode.length > 0 &&
    candidate.normalizedPostalCode === target.normalizedPostalCode &&
    candidateTitleTokens.size > 0 &&
    targetTitleTokens.size > 0 &&
    Math.abs(candidate.startsAt.getTime() - target.startsAt.getTime()) <=
      ONE_DAY_MILLISECONDS &&
    jaccardSimilarity(candidateTitleTokens, targetTitleTokens) >= 0.8
  ) {
    reasons.push("TITLE_POSTAL_DATE_SIMILARITY");
  }

  if (
    candidate.confirmedPoint &&
    target.confirmedPoint &&
    overlap &&
    distanceInMetres(candidate.confirmedPoint, target.confirmedPoint) <= 250
  ) {
    reasons.push("CONFIRMED_LOCATION_SCHEDULE_OVERLAP");
  }

  return reasons;
}

export function classifyListingIdentity(input: {
  readonly incoming: ListingIdentityObservation;
  readonly bySourceListingId: ListingIdentityObservation | null;
  readonly byCanonicalSourceUrl: ListingIdentityObservation | null;
}): ListingIdentityDisposition {
  const { incoming, bySourceListingId, byCanonicalSourceUrl } = input;
  if (
    byCanonicalSourceUrl &&
    byCanonicalSourceUrl.sourceListingId !== incoming.sourceListingId
  ) {
    return "IDENTITY_CONFLICT";
  }

  const existing = bySourceListingId ?? byCanonicalSourceUrl;
  if (!existing) return "CANDIDATE_CREATED";
  return existing.contentHash === incoming.contentHash
    ? "EXACT_DUPLICATE"
    : "SOURCE_CHANGED";
}
