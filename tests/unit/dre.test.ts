import { describe, expect, it } from "vitest";

import {
  balanceEvolution,
  buildDre,
  topExpenseCategories,
  variation,
  type DreCategory,
  type DreTransaction,
} from "@/lib/reports/dre";

/**
 * A DRE e o produto final: se ela erra, o cliente do escritorio recebe um
 * numero errado assinado pelo contador. Estes testes cobrem a aritmetica dos
 * itens 7 e 10 da Secao 6 e os casos que costumam quebrar relatorio na pratica.
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
const servicos = category("Serviços", "REVENUE");
const das = category("DAS", "SALES_TAXES");
const fornecedores = category("Fornecedores", "VARIABLE_COSTS");
const salarios = category("Salários", "PERSONNEL");
const aluguel = category("Aluguel", "OPERATING_EXPENSES");
const tarifas = category("Tarifas", "FINANCIAL_EXPENSES");
const equipamentos = category("Equipamentos", "INVESTMENTS");
const aportes = category("Aportes", "EQUITY_AND_LOANS");
const transferencia = category("Transferência", "TRANSFERS", true);

const CATEGORIES = [
  vendas,
  servicos,
  das,
  fornecedores,
  salarios,
  aluguel,
  tarifas,
  equipamentos,
  aportes,
  transferencia,
];

const tx = (categoryId: string | null, cents: number): DreTransaction => ({
  categoryId,
  amountCents: cents,
});

describe("aritmetica da DRE", () => {
  // Um mes completo, com todos os grupos da Secao 6 representados.
  const current = [
    tx(vendas.id, 20_000_00),
    tx(servicos.id, 5_000_00),
    tx(das.id, -1_500_00),
    tx(fornecedores.id, -8_000_00),
    tx(salarios.id, -6_000_00),
    tx(aluguel.id, -2_500_00),
    tx(tarifas.id, -100_00),
    tx(equipamentos.id, -3_000_00),
    tx(aportes.id, 10_000_00),
  ];

  const report = buildDre({
    categories: CATEGORIES,
    current,
    previous: [],
    closingBalanceCents: 0,
  });

  it("soma cada grupo", () => {
    const byGroup = new Map(report.groups.map((g) => [g.group, g.currentCents]));

    expect(byGroup.get("REVENUE")).toBe(25_000_00);
    expect(byGroup.get("SALES_TAXES")).toBe(-1_500_00);
    expect(byGroup.get("VARIABLE_COSTS")).toBe(-8_000_00);
    expect(byGroup.get("PERSONNEL")).toBe(-6_000_00);
    expect(byGroup.get("OPERATING_EXPENSES")).toBe(-2_500_00);
    expect(byGroup.get("FINANCIAL_EXPENSES")).toBe(-100_00);
  });

  it("calcula o resultado operacional (item 7: 1-2-3-4-5-6)", () => {
    // 25.000 - 1.500 - 8.000 - 6.000 - 2.500 - 100 = 6.900
    expect(report.operatingResult.currentCents).toBe(6_900_00);
  });

  it("calcula a geracao liquida de caixa (item 10: 7-8+9)", () => {
    // 6.900 - 3.000 + 10.000 = 13.900
    expect(report.netCash.currentCents).toBe(13_900_00);
  });

  it("calcula a margem operacional sobre a receita", () => {
    // 6.900 / 25.000 = 27,6%
    expect(report.indicators.marginPct).toBeCloseTo(27.6, 5);
  });

  it("apresenta os grupos na ordem da Secao 6", () => {
    expect(report.groups.map((g) => g.group)).toEqual([
      "REVENUE",
      "SALES_TAXES",
      "VARIABLE_COSTS",
      "PERSONNEL",
      "OPERATING_EXPENSES",
      "FINANCIAL_EXPENSES",
      "INVESTMENTS",
      "EQUITY_AND_LOANS",
      "TRANSFERS",
    ]);
  });
});

describe("transferencias entre contas (Secao 5.4)", () => {
  const comTransferencia = [
    tx(vendas.id, 10_000_00),
    tx(aluguel.id, -2_000_00),
    tx(transferencia.id, -5_000_00),
    tx(transferencia.id, 5_000_00),
  ];

  const report = buildDre({
    categories: CATEGORIES,
    current: comTransferencia,
    previous: [],
    closingBalanceCents: 0,
  });

  it("nao entram no resultado operacional", () => {
    expect(report.operatingResult.currentCents).toBe(8_000_00);
  });

  it("nao entram na geracao liquida", () => {
    expect(report.netCash.currentCents).toBe(8_000_00);
  });

  // Sem esta exclusao, uma transferencia de R$ 5.000 entre as contas da propria
  // empresa apareceria como R$ 5.000 de entrada e R$ 5.000 de saida no mes.
  it("nao inflam entradas nem saidas", () => {
    expect(report.indicators.inflowCents).toBe(10_000_00);
    expect(report.indicators.outflowCents).toBe(-2_000_00);
  });

  it("mas continuam visiveis na tabela, marcadas como neutras", () => {
    const grupo = report.groups.find((g) => g.group === "TRANSFERS");

    expect(grupo?.neutral).toBe(true);
    expect(grupo?.currentCents).toBe(0);
  });
});

describe("comparativo com o mes anterior", () => {
  const report = buildDre({
    categories: CATEGORIES,
    current: [tx(vendas.id, 12_000_00), tx(aluguel.id, -2_000_00)],
    previous: [tx(vendas.id, 10_000_00), tx(aluguel.id, -2_500_00)],
    closingBalanceCents: 0,
  });

  it("calcula a variacao percentual", () => {
    const receitas = report.groups.find((g) => g.group === "REVENUE");
    expect(receitas?.variationPct).toBeCloseTo(20, 5);
  });

  it("usa modulo no denominador, para despesa nao inverter o sinal", () => {
    // Aluguel caiu de 2.500 para 2.000: e uma reducao de 20% na despesa.
    const despesas = report.groups.find((g) => g.group === "OPERATING_EXPENSES");
    expect(despesas?.variationPct).toBeCloseTo(20, 5);
  });

  // "De zero para cinco mil" nao e um aumento de infinito por cento.
  it("devolve null quando o mes anterior foi zero", () => {
    expect(variation(5_000_00, 0)).toBeNull();
  });

  it("aceita queda a zero", () => {
    expect(variation(0, 5_000_00)).toBeCloseTo(-100, 5);
  });
});

describe("casos que quebram relatorio na pratica", () => {
  it("mes sem nenhum lancamento nao explode", () => {
    const report = buildDre({
      categories: CATEGORIES,
      current: [],
      previous: [],
      closingBalanceCents: 50_000_00,
    });

    expect(report.operatingResult.currentCents).toBe(0);
    expect(report.netCash.currentCents).toBe(0);
    expect(report.indicators.marginPct).toBeNull();
    expect(report.indicators.closingBalanceCents).toBe(50_000_00);
  });

  it("sem receita, a margem e nula em vez de dividir por zero", () => {
    const report = buildDre({
      categories: CATEGORIES,
      current: [tx(aluguel.id, -2_000_00)],
      previous: [],
      closingBalanceCents: 0,
    });

    expect(report.indicators.marginPct).toBeNull();
    expect(report.operatingResult.currentCents).toBe(-2_000_00);
  });

  // Estorno de fornecedor e um valor POSITIVO dentro de um grupo de despesa.
  // Somar com sinal acerta; subtrair o modulo erraria em dobro.
  it("estorno dentro de grupo de despesa reduz a despesa", () => {
    const report = buildDre({
      categories: CATEGORIES,
      current: [
        tx(vendas.id, 10_000_00),
        tx(fornecedores.id, -3_000_00),
        tx(fornecedores.id, 500_00),
      ],
      previous: [],
      closingBalanceCents: 0,
    });

    const custos = report.groups.find((g) => g.group === "VARIABLE_COSTS");
    expect(custos?.currentCents).toBe(-2_500_00);
    expect(report.operatingResult.currentCents).toBe(7_500_00);
  });

  it("conta os lancamentos sem categoria em vez de ignora-los", () => {
    const report = buildDre({
      categories: CATEGORIES,
      current: [tx(vendas.id, 1_000_00), tx(null, -500_00), tx(null, 200_00)],
      previous: [],
      closingBalanceCents: 0,
    });

    expect(report.uncategorizedCount).toBe(2);
    // Sem categoria nao entra em grupo nenhum, mas continua em entradas/saidas.
    expect(report.indicators.inflowCents).toBe(1_200_00);
    expect(report.indicators.outflowCents).toBe(-500_00);
  });

  it("prejuizo aparece como resultado negativo, nao como zero", () => {
    const report = buildDre({
      categories: CATEGORIES,
      current: [tx(vendas.id, 1_000_00), tx(salarios.id, -3_000_00)],
      previous: [],
      closingBalanceCents: 0,
    });

    expect(report.operatingResult.currentCents).toBe(-2_000_00);
    expect(report.indicators.marginPct).toBeCloseTo(-200, 5);
  });
});

describe("top categorias de despesa", () => {
  it("ordena por valor e devolve modulo", () => {
    const rows = topExpenseCategories({
      categories: CATEGORIES,
      transactions: [
        tx(salarios.id, -6_000_00),
        tx(fornecedores.id, -8_000_00),
        tx(aluguel.id, -2_500_00),
      ],
    });

    expect(rows).toEqual([
      { name: "Fornecedores", cents: 8_000_00 },
      { name: "Salários", cents: 6_000_00 },
      { name: "Aluguel", cents: 2_500_00 },
    ]);
  });

  it("ignora receitas e investimentos", () => {
    const rows = topExpenseCategories({
      categories: CATEGORIES,
      transactions: [tx(vendas.id, 10_000_00), tx(equipamentos.id, -3_000_00)],
    });

    expect(rows).toEqual([]);
  });

  it("limita a oito linhas", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      category(`Despesa ${i}`, "OPERATING_EXPENSES"),
    );

    const rows = topExpenseCategories({
      categories: many,
      transactions: many.map((c, i) => tx(c.id, -(i + 1) * 100_00)),
    });

    expect(rows).toHaveLength(8);
    expect(rows[0].cents).toBe(1_200_00);
  });
});

describe("evolucao do saldo", () => {
  const monthStart = new Date(Date.UTC(2026, 7, 1));
  const monthEnd = new Date(Date.UTC(2026, 8, 1));

  it("parte do saldo de abertura e acumula", () => {
    const series = balanceEvolution({
      openingBalanceCents: 50_000_00,
      monthStart,
      monthEnd,
      transactions: [
        { date: new Date(Date.UTC(2026, 7, 1)), amountCents: 1_000_00 },
        { date: new Date(Date.UTC(2026, 7, 3)), amountCents: -500_00 },
      ],
    });

    expect(series).toHaveLength(31);
    expect(series[0]).toEqual({ date: "2026-08-01", balanceCents: 51_000_00 });
    expect(series[1]).toEqual({ date: "2026-08-02", balanceCents: 51_000_00 });
    expect(series[2]).toEqual({ date: "2026-08-03", balanceCents: 50_500_00 });
  });

  // Dia sem movimento tem que repetir o saldo; zerar daria a impressao de que
  // a conta esvaziou.
  it("repete o saldo em dias sem movimento", () => {
    const series = balanceEvolution({
      openingBalanceCents: 1_000_00,
      monthStart,
      monthEnd,
      transactions: [],
    });

    expect(series.every((point) => point.balanceCents === 1_000_00)).toBe(true);
  });

  it("cobre o mes inteiro, mesmo sem movimento no fim", () => {
    const series = balanceEvolution({
      openingBalanceCents: 0,
      monthStart,
      monthEnd,
      transactions: [
        { date: new Date(Date.UTC(2026, 7, 2)), amountCents: 700_00 },
      ],
    });

    expect(series.at(-1)).toEqual({ date: "2026-08-31", balanceCents: 700_00 });
  });
});
