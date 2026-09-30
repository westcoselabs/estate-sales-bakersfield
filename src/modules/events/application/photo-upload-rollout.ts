/** Stable account cohorts; the server passes the decision into the editor. */
export function photoUploadV2Enabled(
  userId: string,
  percentage: number,
): boolean {
  let hash = 2166136261;
  for (const character of userId)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) % 100 < Math.max(0, Math.min(100, percentage));
}
