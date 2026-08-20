import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * O CLI do Prisma (migrate, db execute, db seed) sempre usa a conexao DIRETA
 * do Supabase (porta 5432). O pooler em modo transaction nao suporta DDL nem
 * prepared statements de migracao.
 *
 * O runtime da aplicacao usa DATABASE_URL (pooler) via PrismaPg em
 * src/lib/prisma.ts.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"],
  },
});
