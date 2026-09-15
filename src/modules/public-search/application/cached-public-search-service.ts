import type { PublicSearchCriteria, PublicSearchPage } from "../domain/types";
import { resolvePublicDateInterval } from "./date-range";

export const PUBLIC_SEARCH_CACHE_MILLISECONDS = 30_000;

export interface PublicSearchReader {
  search(
    criteria: PublicSearchCriteria,
    now?: Date,
    requestedLimit?: number,
  ): Promise<PublicSearchPage>;
}

export interface CachedPublicSearchPage {
  readonly result: PublicSearchPage;
  readonly computedAt: number;
  readonly validUntil: number;
}

export interface PublicSearchCache {
  readRevision(): Promise<string>;
  readPage(
    key: string,
    load: () => Promise<CachedPublicSearchPage>,
  ): Promise<CachedPublicSearchPage>;
}

export function canCachePublicSearch(criteria: PublicSearchCriteria): boolean {
  return (
    criteria.view === "list" &&
    criteria.cursor === null &&
    !criteria.bounds &&
    criteria.from === null &&
    criteria.to === null &&
    criteria.location === "bakersfield-ca" &&
    criteria.sort === "soonest" &&
    ["all", "today", "tomorrow", "weekend", "next-7-days"].includes(
      criteria.date,
    )
  );
}

export function publicSearchValidUntil(
  result: PublicSearchPage,
  computedAt: Date,
): number {
  const midnight = resolvePublicDateInterval(
    { ...result.criteria, date: "today" },
    computedAt,
  )?.endsAt.getTime();
  let deadline = Math.min(
    computedAt.getTime() + PUBLIC_SEARCH_CACHE_MILLISECONDS,
    midnight ?? Infinity,
  );
  for (const listing of result.items) {
    for (const value of [
      listing.startsAt,
      listing.endsAt,
      ...(listing.location.releasesAt ? [listing.location.releasesAt] : []),
      ...(listing.scheduleDays?.flatMap((day) => [day.startsAt, day.endsAt]) ??
        []),
    ]) {
      const boundary = new Date(value).getTime();
      if (!Number.isFinite(boundary)) return computedAt.getTime();
      if (boundary > computedAt.getTime())
        deadline = Math.min(deadline, boundary);
    }
  }
  return deadline;
}

export class CachedPublicSearchService implements PublicSearchReader {
  constructor(
    private readonly fresh: PublicSearchReader,
    private readonly cache: PublicSearchCache,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async search(
    criteria: PublicSearchCriteria,
    now = this.clock(),
    requestedLimit = 20,
  ): Promise<PublicSearchPage> {
    if (!canCachePublicSearch(criteria))
      return this.fresh.search(criteria, now, requestedLimit);
    const effectiveNow = new Date(
      Math.max(now.getTime(), this.clock().getTime()),
    );
    const limit = Math.min(Math.max(requestedLimit, 1), 24);
    // An authoritative read on every lookup prevents missed application-level
    // invalidations, including moderation or imports changed outside this process.
    const revision = await this.cache.readRevision();
    const slot = Math.floor(
      effectiveNow.getTime() / PUBLIC_SEARCH_CACHE_MILLISECONDS,
    );
    const key = JSON.stringify([
      "public-search-v1",
      revision,
      slot,
      criteria.sale,
      criteria.date,
      limit,
      criteria.bounds === undefined,
    ]);
    const entry = await this.cache.readPage(key, async () => {
      const result = await this.fresh.search(criteria, effectiveNow, limit);
      return {
        result,
        computedAt: effectiveNow.getTime(),
        validUntil: publicSearchValidUntil(result, effectiveNow),
      };
    });
    const servingAt = Math.max(effectiveNow.getTime(), this.clock().getTime());
    if (entry.computedAt > servingAt || entry.validUntil <= servingAt) {
      // Never serve Next's stale-while-revalidate value across an address release,
      // sale end, local date boundary, or cache window.
      return this.fresh.search(criteria, new Date(servingAt), limit);
    }
    return entry.result;
  }
}
