import { PrismaNeon } from "@prisma/adapter-neon";

/**
 * Keep Prisma-generated queries and unqualified raw SQL on the same schema.
 *
 * Prisma's driver-adapter schema option qualifies generated model queries. A
 * schema-bound test URL also carries PostgreSQL's search_path startup option
 * for raw SQL. Production URLs have neither setting and retain their existing
 * public-schema behavior.
 */
export function createNeonAdapter(connectionString: string): PrismaNeon {
  const schema = new URL(connectionString).searchParams.get("schema");
  if (schema && !/^codex_test_[0-9]{13}_[a-f0-9]{12}$/.test(schema)) {
    throw new Error("Prisma schema selection is restricted to test schemas");
  }
  return new PrismaNeon({ connectionString }, schema ? { schema } : undefined);
}
