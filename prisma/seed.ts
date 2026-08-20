import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { DEFAULT_CATEGORIES } from "../src/lib/categories/default-plan";

/**
 * Seed do plano de contas gerencial padrao (Secao 6).
 *
 * Idempotente: as categorias do sistema tem ids fixos e sao gravadas com
 * upsert. Rode a vontade.
 */
async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DIRECT_URL ou DATABASE_URL precisa estar configurada.");
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    for (const category of DEFAULT_CATEGORIES) {
      await prisma.category.upsert({
        where: { id: category.id },
        create: {
          id: category.id,
          workspaceId: null,
          name: category.name,
          group: category.group,
          sortOrder: category.sortOrder,
          isTransferNeutral: category.isTransferNeutral ?? false,
        },
        update: {
          name: category.name,
          group: category.group,
          sortOrder: category.sortOrder,
          isTransferNeutral: category.isTransferNeutral ?? false,
        },
      });
    }

    console.log(
      `Plano de contas padrao sincronizado: ${DEFAULT_CATEGORIES.length} categorias.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
