import { describe, expect, it } from "vitest";

import {
  buildSummaryPrompt,
  toPriorPayload,
  toSummaryPayload,
} from "@/lib/ai/summary-prompt";
import { buildDre, type DreCategory, type DreTransaction } from "@/lib/reports/dre";
import type { PeriodReport } from "@/lib/reports/load";

/**
 * O parecer e o unico texto do relatorio que nao e calculado: e escrito por um
 * modelo a partir do que mandamos. Um erro de projecao aqui nao quebra nada -
 * produz um paragrafo confiante com o numero errado, assinado pelo escritorio.
 * Por isso o foco destes testes e a fidelidade do recorte.
 */

let order = 0;
function category(
  name: string,
  group: DreCategory["group"],
  isTransferNeutral = false,
): DreCategory {
  order += 10;
  return { id: name, name, group, sortOrder: order, isTransferNeutral };
}

const vendas = category("Vendas", "REVENUE");
const aluguel = category("Aluguel", "OPERATING_EXPENSES");
const transferencia = category("Transferência", "TRANSFERS", true);

const CATEGORIES = [vendas, aluguel, transferencia];

function tx(categoryId: string, amountCents: number): DreTransaction {
  return { categoryId, amountCents };
}

function periodReport(params: {
  current: DreTransaction[];
  previous: DreTransaction[];
}): PeriodReport {
  return {
    dre: buildDre({
      categories: CATEGORIES,
      current: params.current,
      previous: params.previous,
      closingBalanceCents: 12_345_67,
    }),
    topExpenses: [{ name: "Aluguel", cents: -3_000_00 }],
    balanceSeries: [{ date: "2026-07-01", balanceCents: 1_000_00 }],
    monthlyFlow: [],
    biggestOutflows: [
      {
        date: "2026-07-10",
        description: "ALUGUEL SALA 302",
        categoryName: "Aluguel",
        amountCents: -3_000_00,
      },
    ],
    biggestInflows: [
      {
        date: "2026-07-05",
        description: "PIX RECEBIDO",
        categoryName: null,
        amountCents: 25_000_00,
      },
    ],
    transactionsBeforeOpening: 0,
  };
}

const MONTH = { year: 2026, month: 7 };

describe("recorte do periodo", () => {
  const report = periodReport({
    current: [tx("Vendas", 25_000_00), tx("Aluguel", -3_000_00)],
    previous: [tx("Vendas", 20_000_00), tx("Aluguel", -3_000_00)],
  });
  const payload = toSummaryPayload(report, MONTH);

  it("converte centavos para reais, nao manda centavos crus", () => {
    // O erro que este teste existe para pegar: 25.000,00 virar 2.500.000,00.
    expect(payload.indicadores.entradas).toBe("25.000,00");
    expect(payload.indicadores.saldoConsolidadoFimDoMes).toBe("12.345,67");
  });

  it("preserva o sinal, que separa entrada de saida", () => {
    expect(payload.indicadores.saidas).toBe("-3.000,00");
    expect(payload.maioresSaidas[0].valor).toBe("-3.000,00");
    expect(payload.maioresEntradas[0].valor).toBe("25.000,00");
  });

  it("marca a competencia no formato brasileiro", () => {
    expect(payload.competencia).toBe("07/2026");
  });

  it("sinaliza o grupo neutro, que fica fora dos totais", () => {
    const transferencias = payload.grupos.find((g) => g.neutro);
    expect(transferencias).toBeDefined();
    expect(payload.grupos.filter((g) => g.neutro)).toHaveLength(1);
  });

  it("descreve lancamento sem categoria em vez de mandar null", () => {
    expect(payload.maioresEntradas[0].categoria).toBe("sem categoria");
  });

  it("arredonda percentual para uma casa", () => {
    // 20.000 -> 25.000 e alta de 25%.
    const receitas = payload.grupos.find((g) => g.grupo === "Receitas");
    expect(receitas?.variacaoPct).toBe(25);
  });
});

describe("recorte do mes anterior", () => {
  it("devolve null quando o mes anterior nao teve movimento", () => {
    // Uma coluna de zeros seria lida como queda de 100% em tudo.
    const report = periodReport({
      current: [tx("Vendas", 25_000_00)],
      previous: [],
    });

    expect(toPriorPayload(report)).toBeNull();
  });

  it("devolve os valores do mes anterior quando houve movimento", () => {
    const report = periodReport({
      current: [tx("Vendas", 25_000_00)],
      previous: [tx("Vendas", 20_000_00)],
    });

    const prior = toPriorPayload(report);

    expect(prior).not.toBeNull();
    expect(prior?.resultadoOperacional).toBe("20.000,00");
  });
});

describe("mensagem enviada ao modelo", () => {
  const report = periodReport({
    current: [tx("Vendas", 25_000_00)],
    previous: [tx("Vendas", 20_000_00)],
  });

  const prompt = buildSummaryPrompt({
    company: "Padaria do Bairro",
    payload: toSummaryPayload(report, MONTH),
    prior: toPriorPayload(report),
  });

  it("traz os dois blocos que a Secao 8.2 exige", () => {
    expect(prompt).toContain("Dados do periodo (JSON):");
    expect(prompt).toContain("Dados do periodo anterior (JSON ou null):");
  });

  it("declara a unidade, para o modelo nao inventar escala", () => {
    expect(prompt).toContain("Valores em BRL");
  });

  it("mantem o limite de 300 palavras e os quatro pontos", () => {
    expect(prompt).toContain("Maximo 300 palavras");
    expect(prompt).toContain("3 a 5 paragrafos");
  });

  it("identifica a empresa", () => {
    expect(prompt).toContain("Padaria do Bairro");
  });

  it("manda null literal quando nao ha mes anterior", () => {
    const semAnterior = buildSummaryPrompt({
      company: "Padaria do Bairro",
      payload: toSummaryPayload(report, MONTH),
      prior: null,
    });

    expect(semAnterior).toContain("(JSON ou null): null");
  });
});
