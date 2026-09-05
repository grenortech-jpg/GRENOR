import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { createDemoCompany } from "../src/lib/demo/create";

/**
 * Empresa de demonstracao com tres meses de dados realistas (Fase 8).
 *
 *   npm run db:demo -- [slug-do-workspace]
 *
 * A geracao vive em src/lib/demo/create.ts, compartilhada com o botao do
 * painel (Fase 12). Este script so escolhe o workspace.
 */
async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DIRECT_URL ou DATABASE_URL precisa estar configurada.");
  }

  const slug = process.argv[2];
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const workspaces = await prisma.workspace.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { createdAt: "asc" },
    });

    if (workspaces.length === 0) {
      throw new Error(
        "Nenhum workspace encontrado. Crie a conta e conclua o onboarding antes de rodar a demonstração.",
      );
    }

    const workspace = slug
      ? workspaces.find((candidate) => candidate.slug === slug)
      : workspaces.length === 1
        ? workspaces[0]
        : undefined;

    if (!workspace) {
      const list = workspaces.map((w) => `  ${w.slug} — ${w.name}`).join("\n");
      throw new Error(
        slug
          ? `Workspace "${slug}" não encontrado. Disponíveis:\n${list}`
          : `Há mais de um workspace. Informe o slug:\n\n  npm run db:demo -- <slug>\n\n${list}`,
      );
    }

    const result = await createDemoCompany(prisma, workspace.id);

    const label = result.months
      .map((m) => `${String(m.month).padStart(2, "0")}/${m.year}`)
      .join(", ");

    console.log(
      [
        "",
        result.replaced ? "Empresa de demonstração anterior removida." : "",
        `Empresa de demonstração criada em "${workspace.name}".`,
        `  Empresa:      ${result.name}`,
        `  Competências: ${label}`,
        `  Lançamentos:  ${result.transactions} (todos categorizados)`,
        "",
        "Abra o painel, escolha a empresa e feche um dos meses para ver o relatório.",
        "",
      ]
        .filter((line) => line !== "")
        .join("\n"),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
