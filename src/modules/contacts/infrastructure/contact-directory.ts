import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { AdminApplicationError } from "@/modules/admin";
import {
  AuthorizationError,
  requireSuperAdminPrincipal,
  type CurrentSession,
} from "@/modules/auth";
import { authorizedAdministratorSession } from "@/platform/database/admin-session-authorization";
import { getPrismaClient } from "@/platform/database/client";
import {
  contactCategories,
  contactStatuses,
  csvCell,
  importInput,
  parseContacts,
} from "../domain/csv";

export const contactFilters = z.object({
  q: z.string().trim().max(320).catch(""),
  category: z.enum(contactCategories).optional().catch(undefined),
  status: z.enum(contactStatuses).optional().catch(undefined),
  sourceTag: z.string().trim().max(80).catch(""),
  page: z.coerce.number().int().min(1).max(100_000).catch(1),
});
type Filters = z.infer<typeof contactFilters>;

export function previewContactImport(raw: unknown) {
  const input = importInput.parse(raw);
  let parsed: ReturnType<typeof parseContacts>;
  try {
    parsed = parseContacts(input);
  } catch (error) {
    throw new AdminApplicationError(
      "INVALID_CSV",
      400,
      (error as Error).message,
    );
  }
  const digest = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  return { input, parsed, digest };
}

function where(filters: Filters): Prisma.AudienceContactWhereInput {
  return {
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.sourceTag ? { sourceTags: { has: filters.sourceTag } } : {}),
    ...(filters.q
      ? {
          OR: ["email", "firstName", "lastName"].map((key) => ({
            [key]: { contains: filters.q, mode: "insensitive" },
          })),
        }
      : {}),
  };
}

export class ContactDirectory {
  constructor(private readonly prisma: PrismaClient) {}

  private async authorized<T>(
    session: CurrentSession | null,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    requireRecent = false,
  ) {
    requireSuperAdminPrincipal(session?.principal ?? null);
    if (!session)
      throw new AuthorizationError("Administrator session required.");
    return this.prisma.$transaction(
      async (tx) => {
        if (
          !(await authorizedAdministratorSession(tx, {
            userId: session.userId,
            sessionId: session.id,
            requireRecent,
          }))
        ) {
          throw new AuthorizationError("Administrator session has expired.");
        }
        return work(tx);
      },
      { timeout: 30_000 },
    );
  }

  list(session: CurrentSession | null, raw: unknown) {
    const filters = contactFilters.parse(raw);
    return this.authorized(session, async (tx) => {
      const criteria = where(filters);
      const [rows, total, counts, imports, tagRows] = await Promise.all([
        tx.audienceContact.findMany({
          where: criteria,
          orderBy: { email: "asc" },
          take: 100,
          skip: (filters.page - 1) * 100,
        }),
        tx.audienceContact.count({ where: criteria }),
        tx.audienceContact.groupBy({ by: ["status"], _count: true }),
        tx.audienceContactImport.findMany({
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
        tx.$queryRaw<
          { tag: string }[]
        >`SELECT DISTINCT unnest("source_tags") AS tag FROM "audience_contacts" ORDER BY tag`,
      ]);
      return {
        rows,
        total,
        counts,
        imports,
        tags: tagRows.map((row) => row.tag),
        filters,
      };
    });
  }

  async import(
    session: CurrentSession | null,
    raw: unknown,
    expectedDigest: string,
    requestId: string,
  ) {
    const { input, parsed, digest } = previewContactImport(raw);
    if (digest !== expectedDigest)
      throw new AdminApplicationError(
        "PREVIEW_CHANGED",
        409,
        "Preview this file again before importing.",
      );
    if (parsed.invalid.length || !parsed.rows.length)
      throw new AdminApplicationError(
        "INVALID_ROWS",
        400,
        "Fix the invalid rows before importing any contacts.",
      );
    if (parsed.counts.SUBSCRIBED && !input.consentConfirmed)
      throw new AdminApplicationError(
        "PERMISSION_REQUIRED",
        400,
        "Confirm permission for Estate Sales Bakersfield promotional emails.",
      );
    return this.authorized(session, async (tx) => {
      // Serialize imports and manual suppression so concurrent re-imports cannot undo an opt-out.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(61105001)`;
      const existing = await tx.audienceContactImport.findUnique({
        where: { digest },
      });
      if (existing)
        return {
          ...(existing.summary as object),
          importId: existing.id,
          alreadyImported: true,
        };
      const result = await tx.$queryRaw<
        { inserted: boolean; status: string }[]
      >(Prisma.sql`
        INSERT INTO "audience_contacts" AS current
          (email, first_name, last_name, category, status, source_tags, consent_confirmed_at, suppressed_at)
        SELECT r.email, r."firstName", r."lastName", ${input.category}, r.status, ARRAY[${input.sourceTag}]::text[],
          CASE WHEN ${input.consentConfirmed} THEN CURRENT_TIMESTAMP ELSE NULL END,
          CASE WHEN r.status <> 'SUBSCRIBED' THEN CURRENT_TIMESTAMP ELSE NULL END
        FROM jsonb_to_recordset(${JSON.stringify(parsed.rows)}::jsonb)
          AS r(email text, "firstName" text, "lastName" text, status text)
        ON CONFLICT (email) DO UPDATE SET
          first_name = COALESCE(NULLIF(EXCLUDED.first_name, ''), current.first_name),
          last_name = COALESCE(NULLIF(EXCLUDED.last_name, ''), current.last_name),
          status = CASE WHEN current.status = 'CLEANED' OR EXCLUDED.status = 'CLEANED' THEN 'CLEANED'
            WHEN current.status = 'UNSUBSCRIBED' OR EXCLUDED.status = 'UNSUBSCRIBED' THEN 'UNSUBSCRIBED' ELSE 'SUBSCRIBED' END,
          source_tags = ARRAY(SELECT DISTINCT unnest(current.source_tags || EXCLUDED.source_tags) ORDER BY 1),
          consent_confirmed_at = COALESCE(current.consent_confirmed_at, EXCLUDED.consent_confirmed_at),
          suppressed_at = COALESCE(current.suppressed_at, EXCLUDED.suppressed_at),
          updated_at = CURRENT_TIMESTAMP
        RETURNING (xmax = 0) AS inserted, status
      `);
      const summary = {
        total: result.length,
        created: result.filter((row) => row.inserted).length,
        updated: result.filter((row) => !row.inserted).length,
        subscribed: result.filter((row) => row.status === "SUBSCRIBED").length,
        suppressed: result.filter((row) => row.status !== "SUBSCRIBED").length,
        duplicates: parsed.duplicates,
        sourceRows: parsed.sourceRows,
      };
      const batch = await tx.audienceContactImport.create({
        data: {
          digest,
          sourceTag: input.sourceTag,
          category: input.category,
          summary,
          importedBy: session!.userId,
          consentConfirmedAt: input.consentConfirmed ? new Date() : null,
        },
      });
      await tx.auditEntry.create({
        data: {
          actorUserId: session!.userId,
          action: "CONTACTS_IMPORTED",
          targetType: "AudienceContactImport",
          targetId: batch.id,
          requestId,
          metadata: {
            ...summary,
            category: input.category,
            sourceTag: input.sourceTag,
          },
        },
      });
      return { ...summary, importId: batch.id, alreadyImported: false };
    });
  }

  unsubscribe(session: CurrentSession | null, id: string, requestId: string) {
    z.uuid().parse(id);
    return this.authorized(session, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(61105001)`;
      const result = await tx.audienceContact.updateMany({
        where: { id, status: "SUBSCRIBED" },
        data: { status: "UNSUBSCRIBED", suppressedAt: new Date() },
      });
      if (result.count)
        await tx.auditEntry.create({
          data: {
            actorUserId: session!.userId,
            action: "CONTACT_UNSUBSCRIBED",
            targetType: "AudienceContact",
            targetId: id,
            requestId,
          },
        });
      return { ok: true };
    });
  }

  export(session: CurrentSession | null, raw: unknown, requestId: string) {
    const filters = contactFilters.parse(raw);
    return this.authorized(
      session,
      async (tx) => {
        const rows = await tx.audienceContact.findMany({
          where: {
            ...where(filters),
            status: "SUBSCRIBED",
            consentConfirmedAt: { not: null },
          },
          orderBy: { email: "asc" },
          take: 10_001,
        });
        if (rows.length > 10_000)
          throw new AdminApplicationError(
            "EXPORT_LIMIT",
            422,
            "Narrow the filters to 10,000 contacts or fewer.",
          );
        // Honor later account opt-outs, restrictions, bounces and complaints too.
        const blocked = await tx.user.findMany({
          where: {
            normalizedEmail: { in: rows.map((row) => row.email) },
            OR: [
              { status: { not: "ACTIVE" } },
              { marketingPreference: { unsubscribedAt: { not: null } } },
              {
                emailDeliveries: {
                  some: {
                    OR: [
                      { bouncedAt: { not: null } },
                      { complainedAt: { not: null } },
                      { suppressedAt: { not: null } },
                    ],
                  },
                },
              },
            ],
          },
          select: { normalizedEmail: true },
        });
        const excluded = new Set(blocked.map((row) => row.normalizedEmail));
        const eligible = rows.filter((row) => !excluded.has(row.email));
        await tx.auditEntry.create({
          data: {
            actorUserId: session!.userId,
            action: "CONTACTS_EXPORTED",
            targetType: "AudienceContact",
            requestId,
            metadata: { count: eligible.length, excluded: excluded.size },
          },
        });
        return [
          "email,first_name,last_name,audience_category,source_tags,status",
          ...eligible.map((row) =>
            [
              row.email,
              row.firstName,
              row.lastName,
              row.category === "ATTENDEE"
                ? "Estate Sale Attendees"
                : "Business Owners",
              row.sourceTags.join("; "),
              row.status,
            ]
              .map(csvCell)
              .join(","),
          ),
        ].join("\r\n");
      },
      true,
    );
  }
}

export const createContactDirectory = () =>
  new ContactDirectory(getPrismaClient());
