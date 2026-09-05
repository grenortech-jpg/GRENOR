import "server-only";

import { memoryKey } from "@/lib/categorization/memory-key";
import { prisma } from "@/lib/prisma";

/**
 * Alimenta a memoria do workspace com confirmacoes humanas (Fase 11).
 *
 * Mesma chave e mesma categoria: hits + 1. Mesma chave e categoria diferente:
 * a decisao mais recente vence e a contagem recomeca - o humano acabou de
 * dizer que a memoria antiga estava errada.
 */
export async function rememberCategorizations(
  workspaceId: string,
  entries: { description: string; categoryId: string }[],
): Promise<number> {
  // Ultima ocorrencia de cada chave vence dentro do mesmo lote.
  const byKey = new Map<string, string>();
  for (const entry of entries) {
    byKey.set(memoryKey(entry.description), entry.categoryId);
  }

  if (byKey.size === 0) return 0;

  const existing = await prisma.categorizationMemory.findMany({
    where: { workspaceId, normalizedDescription: { in: [...byKey.keys()] } },
    select: { normalizedDescription: true, categoryId: true },
  });
  const current = new Map(existing.map((row) => [row.normalizedDescription, row.categoryId]));

  await prisma.$transaction(
    [...byKey.entries()].map(([normalizedDescription, categoryId]) =>
      prisma.categorizationMemory.upsert({
        where: { workspaceId_normalizedDescription: { workspaceId, normalizedDescription } },
        create: { workspaceId, normalizedDescription, categoryId, hits: 1 },
        update:
          current.get(normalizedDescription) === categoryId
            ? { hits: { increment: 1 } }
            : { categoryId, hits: 1 },
      }),
    ),
  );

  return byKey.size;
}

/** Categoria lembrada para cada chave, so as que existem. */
export async function recallCategorizations(
  workspaceId: string,
  keys: string[],
): Promise<Map<string, string>> {
  if (keys.length === 0) return new Map();

  const rows = await prisma.categorizationMemory.findMany({
    where: { workspaceId, normalizedDescription: { in: [...new Set(keys)] } },
    select: { normalizedDescription: true, categoryId: true },
  });

  return new Map(rows.map((row) => [row.normalizedDescription, row.categoryId]));
}
