import { defineConfig } from "prisma/config";

const migrationUrl =
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL ??
  "postgresql://invalid:invalid@127.0.0.1:1/prisma_config_only";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: process.env.PRISMA_MIGRATIONS_PATH ?? "prisma/migrations",
  },
  datasource: { url: migrationUrl },
});
