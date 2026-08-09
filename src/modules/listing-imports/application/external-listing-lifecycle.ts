import { z } from "zod";

export const EXTERNAL_LISTING_EXPIRATION_JOB_TYPE = "EXTERNAL_LISTING_EXPIRE";

export const externalListingExpirationPayloadSchema = z
  .object({
    listingId: z.string().uuid(),
    version: z.number().int().positive(),
    endsAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type ExternalListingExpirationPayload = z.infer<
  typeof externalListingExpirationPayloadSchema
>;

export type ExternalListingExpirationDisposition =
  | "EXPIRED"
  | "ALREADY_EXPIRED"
  | "NOT_FOUND"
  | "STALE_VERSION"
  | "END_DATE_CHANGED"
  | "REMOVED"
  | "NOT_DUE";

export interface ExternalListingExpirationResult {
  readonly disposition: ExternalListingExpirationDisposition;
  readonly listingId: string;
  readonly version?: number;
  readonly canonicalPath?: string;
}

export interface ExternalListingExpirationRepository {
  expireExternalListing(input: {
    readonly listingId: string;
    readonly expectedVersion: number;
    readonly expectedEndsAt: Date;
    readonly jobId?: string;
  }): Promise<ExternalListingExpirationResult>;
}

export interface ExternalListingRevalidator {
  revalidate(paths: readonly string[]): void | Promise<void>;
}

const EXTERNAL_LISTING_COLLECTION_PATHS = [
  "/",
  "/estate-sales",
  "/yard-sales",
  "/search",
] as const;

export function externalListingRevalidationPaths(
  ...canonicalPaths: readonly (string | null | undefined)[]
): readonly string[] {
  return [
    ...new Set([
      ...EXTERNAL_LISTING_COLLECTION_PATHS,
      ...canonicalPaths.filter((path): path is string =>
        Boolean(path?.startsWith("/")),
      ),
    ]),
  ];
}

export class ExternalListingLifecycleService {
  constructor(
    private readonly listings: ExternalListingExpirationRepository,
    private readonly revalidator: ExternalListingRevalidator,
  ) {}

  async expire(
    value: unknown,
    context: { readonly jobId?: string } = {},
  ): Promise<ExternalListingExpirationResult> {
    const payload = externalListingExpirationPayloadSchema.parse(value);
    const result = await this.listings.expireExternalListing({
      listingId: payload.listingId,
      expectedVersion: payload.version,
      expectedEndsAt: new Date(payload.endsAt),
      ...(context.jobId ? { jobId: context.jobId } : {}),
    });

    if (result.disposition === "NOT_DUE") {
      throw new Error("EXTERNAL_LISTING_EXPIRATION_NOT_DUE");
    }
    if (
      result.canonicalPath &&
      (result.disposition === "EXPIRED" ||
        result.disposition === "ALREADY_EXPIRED")
    ) {
      await this.revalidator.revalidate(
        externalListingRevalidationPaths(result.canonicalPath),
      );
    }
    return result;
  }
}
