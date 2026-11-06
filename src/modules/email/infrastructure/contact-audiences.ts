import "server-only";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { ContactAudienceOption } from "../domain/types";

// Shared by the review count, queue snapshot, and final worker revalidation.
const eligibleContact = Prisma.sql`
  c.status = 'SUBSCRIBED' AND c.consent_confirmed_at IS NOT NULL AND c.suppressed_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM users u LEFT JOIN marketing_preferences m ON m.user_id = u.id
    WHERE u.normalized_email = c.email AND (
      u.status <> 'ACTIVE' OR u.role <> 'USER' OR m.unsubscribed_at IS NOT NULL
      OR EXISTS (SELECT 1 FROM email_deliveries d WHERE d.user_id = u.id
        AND (d.bounced_at IS NOT NULL OR d.complained_at IS NOT NULL OR d.suppressed_at IS NOT NULL))
    )
  )`;

export async function eligibleAudienceContacts(
  database: PrismaClient | Prisma.TransactionClient,
  filter: { category: string; sourceTag: string; campaignId?: string },
) {
  return database.$queryRaw<
    { id: string; email: string; firstName: string }[]
  >(Prisma.sql`
    SELECT c.id, c.email, c.first_name AS "firstName" FROM audience_contacts c
    WHERE c.category = ${filter.category} AND ${filter.sourceTag} = ANY(c.source_tags)
      AND ${eligibleContact}
      ${
        filter.campaignId
          ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM email_campaign_contact_recipients r
        WHERE r.campaign_id = ${filter.campaignId}::uuid AND r.contact_id = c.id AND r.email = c.email
      )`
          : Prisma.empty
      }
    ORDER BY c.id LIMIT 10001
  `);
}

/** Counts the actual saved contact groups, honoring contact and account suppressions. */
export async function contactAudienceOptions(
  database: PrismaClient | Prisma.TransactionClient,
  filter?: { category: string; sourceTag: string },
): Promise<ContactAudienceOption[]> {
  return database.$queryRaw<ContactAudienceOption[]>(Prisma.sql`
    WITH audience AS (
      SELECT c.category, tag AS "sourceTag",
        ${eligibleContact} AS eligible
      FROM audience_contacts c CROSS JOIN LATERAL unnest(c.source_tags) AS tag
      ${filter ? Prisma.sql`WHERE c.category = ${filter.category} AND tag = ${filter.sourceTag}` : Prisma.empty}
    )
    SELECT category, "sourceTag", count(*)::integer AS total,
      count(*) FILTER (WHERE eligible)::integer AS eligible,
      count(*) FILTER (WHERE NOT eligible)::integer AS suppressed
    FROM audience GROUP BY category, "sourceTag" ORDER BY category, "sourceTag"
  `);
}
