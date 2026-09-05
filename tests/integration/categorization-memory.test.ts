import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_CATEGORIES } from "@/lib/categories/default-plan";
import { recallCategorizations, rememberCategorizations } from "@/lib/categorization/memory";
import { memoryKey } from "@/lib/categorization/memory-key";
import { prisma } from "@/lib/prisma";

/**
 * Memoria do workspace contra o banco real (Fase 11): alimentacao,
 * contagem de confirmacoes e, principalmente, isolamento - a memoria de um
 * escritorio nunca responde para outro. Roda com `npm run test:db`.
 */

const SUFFIX = "memory-test";

let workspaceA: string;
let workspaceB: string;
let categoryA: string;
let otherCategoryA: string;

beforeAll(async () => {
  await prisma.workspace.deleteMany({ where: { slug: { endsWith: SUFFIX } } });

  const fornecedores = DEFAULT_CATEGORIES.find((c) => c.name === "Fornecedores / CMV")!;
  const energia = DEFAULT_CATEGORIES.find((c) => c.name === "Energia, água e internet")!;

  const a = await prisma.workspace.create({
    data: {
      name: "Memoria A",
      slug: `ws-a-${SUFFIX}`,
      categories: {
        create: [
          { name: fornecedores.name, group: fornecedores.group, sortOrder: 1, defaultId: fornecedores.id },
          { name: energia.name, group: energia.group, sortOrder: 2, defaultId: energia.id },
        ],
      },
    },
    include: { categories: true },
  });
  workspaceA = a.id;
  categoryA = a.categories[0].id;
  otherCategoryA = a.categories[1].id;

  const b = await prisma.workspace.create({
    data: { name: "Memoria B", slug: `ws-b-${SUFFIX}` },
  });
  workspaceB = b.id;
}, 60_000);

afterAll(async () => {
  await prisma.workspace.deleteMany({ where: { slug: { endsWith: SUFFIX } } });
  await prisma.$disconnect();
}, 60_000);

describe("memoria do workspace", () => {
  it("lembra a confirmacao humana pela chave normalizada", async () => {
    await rememberCategorizations(workspaceA, [
      { description: "PAG FORNECEDOR MOINHO CENTRAL 12345", categoryId: categoryA },
    ]);

    const recalled = await recallCategorizations(workspaceA, [
      memoryKey("Pag Fornecedor Moinho Central 99999"),
    ]);

    expect(recalled.get("PAG FORNECEDOR MOINHO CENTRAL")).toBe(categoryA);
  });

  it("conta as confirmacoes e recomeca quando a categoria muda", async () => {
    await rememberCategorizations(workspaceA, [
      { description: "PAG FORNECEDOR MOINHO CENTRAL", categoryId: categoryA },
    ]);

    let row = await prisma.categorizationMemory.findUniqueOrThrow({
      where: {
        workspaceId_normalizedDescription: {
          workspaceId: workspaceA,
          normalizedDescription: "PAG FORNECEDOR MOINHO CENTRAL",
        },
      },
    });
    expect(row.hits).toBe(2);

    await rememberCategorizations(workspaceA, [
      { description: "PAG FORNECEDOR MOINHO CENTRAL", categoryId: otherCategoryA },
    ]);

    row = await prisma.categorizationMemory.findUniqueOrThrow({ where: { id: row.id } });
    expect(row.categoryId).toBe(otherCategoryA);
    expect(row.hits).toBe(1);
  });

  it("nunca responde para outro workspace", async () => {
    const recalled = await recallCategorizations(workspaceB, [
      "PAG FORNECEDOR MOINHO CENTRAL",
    ]);

    expect(recalled.size).toBe(0);
  });

  it("some junto com a categoria", async () => {
    await prisma.category.delete({ where: { id: otherCategoryA } });

    const left = await prisma.categorizationMemory.count({
      where: { workspaceId: workspaceA, normalizedDescription: "PAG FORNECEDOR MOINHO CENTRAL" },
    });
    expect(left).toBe(0);
  });
});
