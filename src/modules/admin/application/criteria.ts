import { z } from "zod";

import type {
  AdminCursor,
  AdminListingFilter,
  AdminUserFilter,
} from "../domain/types";

const uuid = z.string().uuid();

function safeQuery(value: string | undefined, maximum: number): string {
  return (value ?? "").trim().slice(0, maximum);
}

export function encodeAdminCursor(cursor: AdminCursor): string {
  return Buffer.from(
    JSON.stringify({ at: cursor.at.toISOString(), id: cursor.id }),
    "utf8",
  ).toString("base64url");
}

export function decodeAdminCursor(
  value: string | undefined,
): AdminCursor | null {
  if (!value) return null;
  try {
    const parsed = z
      .object({ at: z.iso.datetime(), id: uuid })
      .strict()
      .parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    return { at: new Date(parsed.at), id: parsed.id };
  } catch {
    return null;
  }
}

export function userDirectoryCriteria(input: {
  q?: string;
  filter?: string;
  cursor?: string;
  limit?: string;
}) {
  const filters: readonly AdminUserFilter[] = [
    "all",
    "verified",
    "unverified",
    "published",
    "restricted",
  ];
  const limit = Math.min(Math.max(Number(input.limit) || 25, 1), 50);
  return {
    search: safeQuery(input.q, 320),
    filter: filters.includes(input.filter as AdminUserFilter)
      ? (input.filter as AdminUserFilter)
      : ("all" as const),
    cursor: decodeAdminCursor(input.cursor),
    limit,
  };
}

export function listingDirectoryCriteria(input: {
  q?: string;
  filter?: string;
  cursor?: string;
  limit?: string;
}) {
  const filters: readonly AdminListingFilter[] = [
    "active",
    "drafts",
    "published",
    "ended",
    "canceled",
    "deleted",
    "removed",
  ];
  const limit = Math.min(Math.max(Number(input.limit) || 25, 1), 50);
  return {
    search: safeQuery(input.q, 320),
    filter: filters.includes(input.filter as AdminListingFilter)
      ? (input.filter as AdminListingFilter)
      : ("active" as const),
    cursor: decodeAdminCursor(input.cursor),
    limit,
  };
}
