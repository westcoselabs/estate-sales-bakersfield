import { z } from "zod";

import {
  LISTING_IMPORT_ADMIN_VIEWS,
  type ListingImportAdminCursor,
  type ListingImportAdminView,
} from "./admin-query-ports";

const DEFAULT_PAGE_SIZE = 20;
const MAXIMUM_PAGE_SIZE = 50;
const MAXIMUM_CURSOR_LENGTH = 512;

const cursorSchema = z
  .object({
    version: z.literal(1),
    view: z.enum(LISTING_IMPORT_ADMIN_VIEWS),
    at: z.iso.datetime({ offset: true }),
    id: z.string().uuid(),
  })
  .strict();

export interface ListingImportAdminLandingCriteria {
  readonly view: ListingImportAdminView;
  readonly cursor: ListingImportAdminCursor | null;
  readonly limit: number;
}

function viewFrom(value: string | undefined): ListingImportAdminView {
  return LISTING_IMPORT_ADMIN_VIEWS.includes(value as ListingImportAdminView)
    ? (value as ListingImportAdminView)
    : "candidates";
}

function limitFrom(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(parsed, 1), MAXIMUM_PAGE_SIZE);
}

export function encodeListingImportAdminCursor(
  view: ListingImportAdminView,
  cursor: ListingImportAdminCursor,
): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      view,
      at: cursor.at.toISOString(),
      id: cursor.id,
    }),
    "utf8",
  ).toString("base64url");
}

export function decodeListingImportAdminCursor(
  value: string | undefined,
  expectedView: ListingImportAdminView,
): ListingImportAdminCursor | null {
  if (!value || value.length > MAXIMUM_CURSOR_LENGTH) return null;
  try {
    const parsed = cursorSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
    if (parsed.view !== expectedView) return null;
    const at = new Date(parsed.at);
    return Number.isNaN(at.getTime()) ? null : { at, id: parsed.id };
  } catch {
    return null;
  }
}

export function listingImportAdminLandingCriteria(input: {
  readonly view?: string;
  readonly cursor?: string;
  readonly limit?: string;
}): ListingImportAdminLandingCriteria {
  const view = viewFrom(input.view);
  return {
    view,
    cursor: decodeListingImportAdminCursor(input.cursor, view),
    limit: limitFrom(input.limit),
  };
}
