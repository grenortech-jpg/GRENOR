import { describe, expect, it } from "vitest";

import {
  buildCategorizationPrompt,
  CATEGORIZATION_SYSTEM_PROMPT,
  chunkTransactions,
  CONFIDENCE_THRESHOLD,
  MAX_BATCHES_PER_RUN,
  MAX_BATCH_SIZE,
  renderCategoryList,
  renderTransactionList,
} from "@/lib/ai/prompt";

const categories = [
  { id: "cat-1", name: "Receita de vendas", groupLabel: "Receitas" },
  { id: "cat-2", name: "Tarifas bancárias", groupLabel: "(-) Despesas financeiras" },
];

const transactions = [
  {
    id: "tx-1",
    date: new Date(Date.UTC(2026, 7, 3)),
    amountCents: 345000,
    description: "PIX RECEBIDO JOSÉ ANTÔNIO",
  },
  {
    id: "tx-2",
    date: new Date(Date.UTC(2026, 7, 10)),
    amountCents: -4990,
    description: "TAR MANUT CONTA",
  },
];

describe("limites da especificacao", () => {
  it("respeita os numeros das Secoes 5.3 e 5.6", () => {
    expect(MAX_BATCH_SIZE).toBe(50);
    expect(MAX_BATCHES_PER_RUN).toBe(20);
    expect(CONFIDENCE_THRESHOLD).toBe(0.8);
    // 20 lotes x 50 = 1.000 transacoes por clique.
    expect(MAX_BATCHES_PER_RUN * MAX_BATCH_SIZE).toBe(1000);
  });
});

describe("divisao em lotes", () => {
  it("nao passa de 50 por lote", () => {
    const items = Array.from({ length: 137 }, (_, i) => i);
    const batches = chunkTransactions(items);

    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(50);
    expect(batches[2]).toHaveLength(37);
  });

  it("nao perde nem duplica nenhum item", () => {
    const items = Array.from({ length: 137 }, (_, i) => i);
    const flat = chunkTransactions(items).flat();

    expect(flat).toEqual(items);
  });

  it("lida com lista vazia", () => {
    expect(chunkTransactions([])).toEqual([]);
  });
});

describe("montagem do prompt", () => {
  it("usa o system prompt fixo da Secao 8.1", () => {
    expect(CATEGORIZATION_SYSTEM_PROMPT).toContain(
      "classificador de transacoes bancarias",
    );
    expect(CATEGORIZATION_SYSTEM_PROMPT).toContain("SOMENTE com JSON valido");
  });

  it("lista as categorias como id | nome | grupo", () => {
    expect(renderCategoryList(categories)).toBe(
      "cat-1 | Receita de vendas | Receitas\n" +
        "cat-2 | Tarifas bancárias | (-) Despesas financeiras",
    );
  });

  it("preserva o sinal do valor", () => {
    // Sem o sinal, "PAGAMENTO 100,00" e "RECEBIMENTO 100,00" ficam
    // indistinguiveis para o modelo.
    const rendered = renderTransactionList(transactions);

    expect(rendered).toContain("+3.450,00");
    expect(rendered).toContain("-49,90");
  });

  it("usa data ISO, sem hora", () => {
    expect(renderTransactionList(transactions)).toContain("2026-08-03");
  });

  it("preserva a descricao original, com acentos", () => {
    expect(renderTransactionList(transactions)).toContain("JOSÉ ANTÔNIO");
  });

  it("inclui as regras de desambiguacao da Secao 8.1", () => {
    const prompt = buildCategorizationPrompt({ categories, transactions });

    expect(prompt).toContain("confidence entre 0 e 1");
    expect(prompt).toContain("use < 0.8 quando houver duvida real");
    expect(prompt).toContain("categoria de transferencia");
    expect(prompt).toContain("Receita de vendas com confidence <= 0.7");
    expect(prompt).toContain("Tarifas bancarias");
  });

  it("descreve o formato de resposta esperado", () => {
    const prompt = buildCategorizationPrompt({ categories, transactions });

    expect(prompt).toContain(
      '{"results":[{"txId":"...","categoryId":"...","confidence":0.0}]}',
    );
  });

  it("coloca as categorias antes do lote", () => {
    // Categorias sao estaveis entre lotes do mesmo workspace; o lote muda.
    // Essa ordem e o que permite o cache de prefixo (Secao 5.6).
    const prompt = buildCategorizationPrompt({ categories, transactions });

    expect(prompt.indexOf("cat-1")).toBeLessThan(prompt.indexOf("tx-1"));
  });
});
