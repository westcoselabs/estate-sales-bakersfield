import "server-only";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { ContactAudienceOption } from "../domain/types";

/** Counts the actual saved contact groups, honoring contact and account suppressions. */
export async function contactAudienceOptions(
  database: PrismaClient | Prisma.TransactionClient,
  filter?: { category: string; sourceTag: string },
): Promise<ContactAudienceOption[]> {
  return database.$queryRaw<ContactAudienceOption[]>(Prisma.sql`
    WITH audience AS (
      SELECT c.category, tag AS "sourceTag",
        c.status = 'SUBSCRIBED' AND c.consent_confirmed_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM users u LEFT JOIN marketing_preferences m ON m.user_id = u.id
          WHERE u.normalized_email = c.email AND (
            u.status <> 'ACTIVE' OR u.role <> 'USER' OR m.unsubscribed_at IS NOT NULL
            OR EXISTS (SELECT 1 FROM email_deliveries d WHERE d.user_id = u.id
              AND (d.bounced_at IS NOT NULL OR d.complained_at IS NOT NULL OR d.suppressed_at IS NOT NULL))
          )
        ) AS eligible
      FROM audience_contacts c CROSS JOIN LATERAL unnest(c.source_tags) AS tag
      ${filter ? Prisma.sql`WHERE c.category = ${filter.category} AND tag = ${filter.sourceTag}` : Prisma.empty}
    )
    SELECT category, "sourceTag", count(*)::integer AS total,
      count(*) FILTER (WHERE eligible)::integer AS eligible,
      count(*) FILTER (WHERE NOT eligible)::integer AS suppressed
    FROM audience GROUP BY category, "sourceTag" ORDER BY category, "sourceTag"
  `);
}
