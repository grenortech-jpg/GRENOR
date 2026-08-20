import { afterAll, describe, expect, it } from "vitest";

import { categorizeWithAi } from "@/lib/ai/categorize";
import { isAiEnabled } from "@/lib/ai/client";
import { CONFIDENCE_THRESHOLD } from "@/lib/ai/prompt";
import { CATEGORY_GROUP_LABELS } from "@/lib/categories/default-plan";
import { prisma } from "@/lib/prisma";

/**
 * Exercita a camada 2 contra a API real da Anthropic.
 *
 * Custa dinheiro a cada execucao, entao so roda com AI_ENABLED=true e chave
 * configurada. Sem isso a suite inteira e pulada - e essa e tambem a
 * verificacao de que a aplicacao nao depende da IA (Secao 8.3).
 */

const enabled = isAiEnabled();

afterAll(async () => {
  await prisma.$disconnect();
});

describe.skipIf(!enabled)("categorizacao pela IA (API real)", () => {
  it("classifica os lancamentos que as regras nao pegaram", async () => {
    const workspace = await prisma.workspace.findFirstOrThrow();

    const categories = await prisma.category.findMany({
      where: { workspaceId: workspace.id },
    });

    const pending = await prisma.transaction.findMany({
      where: {
        categoryId: null,
        account: { company: { workspaceId: workspace.id } },
      },
      select: { id: true, date: true, amountCents: true, description: true },
      orderBy: { date: "asc" },
      take: 20,
    });

    if (pending.length === 0) {
      console.log("nada pendente para classificar");
      return;
    }

    const run = await categorizeWithAi({
      workspaceId: workspace.id,
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        groupLabel: CATEGORY_GROUP_LABELS[category.group],
      })),
      transactions: pending,
    });

    const byId = new Map(categories.map((c) => [c.id, c.name]));
    const descriptionById = new Map(pending.map((t) => [t.id, t.description]));

    console.log(`\n${pending.length} pendentes, ${run.batchesRun} lote(s)`);
    console.log(
      `tokens: ${run.inputTokens} entrada, ${run.outputTokens} saida`,
    );
    console.log(
      `custo estimado: US$ ${(
        (run.inputTokens / 1_000_000) * 3 +
        (run.outputTokens / 1_000_000) * 15
      ).toFixed(5)}\n`,
    );

    for (const suggestion of run.suggestions) {
      console.log(
        `  ${suggestion.apply ? "APLICA " : "SUGERE "} ` +
          `${String(Math.round(suggestion.confidence * 100)).padStart(3)}%  ` +
          `${byId.get(suggestion.categoryId)?.padEnd(30)} ` +
          `${descriptionById.get(suggestion.transactionId)?.slice(0, 45)}`,
      );
    }

    // Falha de conta (sem credito, chave recusada) nao e defeito do codigo:
    // relata e encerra, em vez de deixar a suite vermelha por um motivo que
    // nenhuma alteracao de codigo resolve.
    if (run.failureReason === "billing" || run.failureReason === "auth") {
      console.log(
        `
NAO FOI POSSIVEL TESTAR: ${run.failureReason === "billing" ? "conta sem creditos" : "chave recusada"}.` +
          `
O tratamento de falha funcionou: ${run.batchesFailed} lote(s) falharam sem quebrar a execucao.`,
      );
      expect(run.suggestions).toEqual([]);
      return;
    }

    expect(run.batchesFailed).toBe(0);
    expect(run.suggestions.length).toBeGreaterThan(0);

    // Toda sugestao aponta para categoria real do workspace.
    const validIds = new Set(categories.map((c) => c.id));
    for (const suggestion of run.suggestions) {
      expect(validIds.has(suggestion.categoryId)).toBe(true);
    }

    // Toda sugestao aponta para transacao do lote enviado.
    const sentIds = new Set(pending.map((t) => t.id));
    for (const suggestion of run.suggestions) {
      expect(sentIds.has(suggestion.transactionId)).toBe(true);
    }

    // O limiar da Secao 5.3 e respeitado nos dois sentidos.
    for (const suggestion of run.suggestions) {
      expect(suggestion.apply).toBe(
        suggestion.confidence >= CONFIDENCE_THRESHOLD,
      );
    }

    // Confianca sempre entre 0 e 1.
    for (const suggestion of run.suggestions) {
      expect(suggestion.confidence).toBeGreaterThanOrEqual(0);
      expect(suggestion.confidence).toBeLessThanOrEqual(1);
    }
  }, 120_000);
});

describe.skipIf(enabled)("sem IA configurada", () => {
  it("devolve resultado vazio em vez de falhar", async () => {
    const run = await categorizeWithAi({
      workspaceId: "qualquer",
      categories: [{ id: "c1", name: "Vendas", groupLabel: "Receitas" }],
      transactions: [
        {
          id: "t1",
          date: new Date(),
          amountCents: 100,
          description: "TESTE",
        },
      ],
    });

    expect(run.suggestions).toEqual([]);
    expect(run.batchesRun).toBe(0);
  });
});
