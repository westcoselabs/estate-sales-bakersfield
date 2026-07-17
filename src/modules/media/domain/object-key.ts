import { MediaStoreError } from "./errors";
import type { MediaObjectKey, MediaScope } from "./types";

const SCOPE_SEGMENT = /^[A-Za-z0-9_-]{1,100}$/;
const FILE_SEGMENT = /^(?!\.)(?!.*\.\.)(?=.{1,160}$)[A-Za-z0-9_.-]+$/;

function assertSegment(value: string, pattern: RegExp, field: string): void {
  if (!pattern.test(value)) {
    throw new MediaStoreError(
      "INVALID_SCOPE",
      `${field} is not a safe object-key segment`,
    );
  }
}

export function createMediaObjectKey(scope: MediaScope): MediaObjectKey {
  assertSegment(scope.environment, SCOPE_SEGMENT, "environment");
  assertSegment(scope.resourceScope, SCOPE_SEGMENT, "resourceScope");
  assertSegment(scope.reservationId, SCOPE_SEGMENT, "reservationId");
  assertSegment(scope.randomName, FILE_SEGMENT, "randomName");

  return [
    scope.environment,
    scope.resourceScope,
    scope.reservationId,
    scope.randomName,
  ].join("/") as MediaObjectKey;
}
