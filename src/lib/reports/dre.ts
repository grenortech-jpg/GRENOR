import type { CategoryGroup } from "@/generated/prisma/enums";
import {
  CATEGORY_GROUP_LABELS,
  CATEGORY_GROUP_ORDER,
} from "@/lib/categories/default-plan";

/**
 * DRE de caixa (Secao 6 do CLAUDE.md).
 *
 * Convencao de sinal: transacao guarda negativo para saida. Por isso todo
 * total aqui e uma SOMA de valores com sinal, nunca uma subtracao manual.
 * A Secao 6 escreve "1-2-3-4-5-6" porque le os grupos de despesa como valores
 * positivos a subtrair; somar valores ja sinalizados da o mesmo numero e
 * continua correto quando um estorno positivo cai dentro de um grupo de
 * despesa - caso em que a subtracao manual erraria.
 *
 * Funcoes puras de proposito: recebem lancamentos ja carregados e devolvem o
 * relatorio. Isso permite testar o calculo inteiro sem banco.
 */

/** Grupos que entram no resultado operacional (itens 1 a 6 da Secao 6). */
const OPERATING_GROUPS: CategoryGroup[] = [
  "REVENUE",
  "SALES_TAXES",
  "VARIABLE_COSTS",
  "PERSONNEL",
  "OPERATING_EXPENSES",
  "FINANCIAL_EXPENSES",
];

/** Grupos abaixo do resultado operacional (itens 8 e 9). */
const BELOW_OPERATING_GROUPS: CategoryGroup[] = [
  "INVESTMENTS",
  "EQUITY_AND_LOANS",
];

export type DreTransaction = {
  categoryId: string | null;
  amountCents: number;
};

export type DreCategory = {
  id: string;
  name: string;
  group: CategoryGroup;
  sortOrder: number;
  isTransferNeutral: boolean;
};

export type DreLine = {
  categoryId: string;
  name: string;
  currentCents: number;
  previousCents: number;
  variationPct: number | null;
};

export type DreGroup = {
  group: CategoryGroup;
  label: string;
  lines: DreLine[];
  currentCents: number;
  previousCents: number;
  variationPct: number | null;
  /** Transferencias sao neutras: exibidas, mas fora dos totais (Secao 6). */
  neutral: boolean;
};

export type DreTotal = {
  key: "OPERATING_RESULT" | "NET_CASH";
  label: string;
  currentCents: number;
  previousCents: number;
  variationPct: number | null;
};

export type DreIndicators = {
  inflowCents: number;
  outflowCents: number;
  operatingResultCents: number;
  netCashCents: number;
  /** Resultado operacional sobre receitas, em pontos percentuais. */
  marginPct: number | null;
  closingBalanceCents: number;
};

export type DreReport = {
  groups: DreGroup[];
  operatingResult: DreTotal;
  netCash: DreTotal;
  indicators: DreIndicators;
  /** Lancamentos do periodo ainda sem categoria. */
  uncategorizedCount: number;
};

/**
 * Variacao percentual entre dois periodos.
 *
 * Devolve null quando o mes anterior foi zero: "de 0 para 5.000" nao e um
 * aumento de infinito por cento, e exibir isso destroi a credibilidade do
 * relatorio. A interface mostra um traco nesse caso.
 */
export function variation(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function sumByCategory(transactions: DreTransaction[]): Map<string, number> {
  const totals = new Map<string, number>();

  for (const transaction of transactions) {
    if (!transaction.categoryId) continue;
    totals.set(
      transaction.categoryId,
      (totals.get(transaction.categoryId) ?? 0) + transaction.amountCents,
    );
  }

  return totals;
}

export function buildDre(params: {
  categories: DreCategory[];
  current: DreTransaction[];
  previous: DreTransaction[];
  /** Saldo consolidado das contas no fim do periodo. */
  closingBalanceCents: number;
}): DreReport {
  const currentByCategory = sumByCategory(params.current);
  const previousByCategory = sumByCategory(params.previous);

  const groups: DreGroup[] = CATEGORY_GROUP_ORDER.map((group) => {
    const categories = params.categories
      .filter((category) => category.group === group)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const lines: DreLine[] = categories.map((category) => {
      const currentCents = currentByCategory.get(category.id) ?? 0;
      const previousCents = previousByCategory.get(category.id) ?? 0;

      return {
        categoryId: category.id,
        name: category.name,
        currentCents,
        previousCents,
        variationPct: variation(currentCents, previousCents),
      };
    });

    const currentCents = lines.reduce((total, line) => total + line.currentCents, 0);
    const previousCents = lines.reduce(
      (total, line) => total + line.previousCents,
      0,
    );

    return {
      group,
      label: CATEGORY_GROUP_LABELS[group],
      lines,
      currentCents,
      previousCents,
      variationPct: variation(currentCents, previousCents),
      neutral: group === "TRANSFERS",
    };
  });

  const sumGroups = (
    wanted: CategoryGroup[],
    pick: (group: DreGroup) => number,
  ): number =>
    groups
      .filter((group) => wanted.includes(group.group))
      .reduce((total, group) => total + pick(group), 0);

  // Item 7 da Secao 6.
  const operatingCurrent = sumGroups(OPERATING_GROUPS, (g) => g.currentCents);
  const operatingPrevious = sumGroups(OPERATING_GROUPS, (g) => g.previousCents);

  // Item 10: resultado operacional mais investimentos e movimentacoes
  // societarias, todos ja com o sinal correto.
  const netCurrent =
    operatingCurrent + sumGroups(BELOW_OPERATING_GROUPS, (g) => g.currentCents);
  const netPrevious =
    operatingPrevious + sumGroups(BELOW_OPERATING_GROUPS, (g) => g.previousCents);

  const revenue = groups.find((group) => group.group === "REVENUE");
  const revenueCents = revenue?.currentCents ?? 0;

  // Entradas e saidas ignoram transferencia: ela entra e sai da mesma empresa,
  // e conta-la infla os dois lados sem alterar o resultado (Secao 5.4).
  const movements = params.current.filter((transaction) => {
    if (!transaction.categoryId) return true;
    const category = params.categories.find(
      (item) => item.id === transaction.categoryId,
    );
    return !category?.isTransferNeutral;
  });

  const inflowCents = movements
    .filter((transaction) => transaction.amountCents > 0)
    .reduce((total, transaction) => total + transaction.amountCents, 0);

  const outflowCents = movements
    .filter((transaction) => transaction.amountCents < 0)
    .reduce((total, transaction) => total + transaction.amountCents, 0);

  return {
    groups,
    operatingResult: {
      key: "OPERATING_RESULT",
      label: "Resultado operacional de caixa",
      currentCents: operatingCurrent,
      previousCents: operatingPrevious,
      variationPct: variation(operatingCurrent, operatingPrevious),
    },
    netCash: {
      key: "NET_CASH",
      label: "Geração líquida de caixa",
      currentCents: netCurrent,
      previousCents: netPrevious,
      variationPct: variation(netCurrent, netPrevious),
    },
    indicators: {
      inflowCents,
      outflowCents,
      operatingResultCents: operatingCurrent,
      netCashCents: netCurrent,
      marginPct: revenueCents === 0 ? null : (operatingCurrent / revenueCents) * 100,
      closingBalanceCents: params.closingBalanceCents,
    },
    uncategorizedCount: params.current.filter(
      (transaction) => !transaction.categoryId,
    ).length,
  };
}

/**
 * Top categorias de despesa do periodo (Secao 7, grafico de barras
 * horizontais).
 *
 * Considera apenas grupos de despesa e valores negativos: um estorno positivo
 * dentro de "Fornecedores" reduz a despesa do mes, nao vira uma barra.
 */
export function topExpenseCategories(
  params: {
    categories: DreCategory[];
    transactions: DreTransaction[];
  },
  limit = 8,
): { name: string; cents: number }[] {
  const expenseGroups: CategoryGroup[] = [
    "SALES_TAXES",
    "VARIABLE_COSTS",
    "PERSONNEL",
    "OPERATING_EXPENSES",
    "FINANCIAL_EXPENSES",
  ];

  const byCategory = sumByCategory(params.transactions);
  const rows: { name: string; cents: number }[] = [];

  for (const category of params.categories) {
    if (!expenseGroups.includes(category.group)) continue;

    const total = byCategory.get(category.id) ?? 0;
    if (total >= 0) continue;

    rows.push({ name: category.name, cents: Math.abs(total) });
  }

  return rows.sort((a, b) => b.cents - a.cents).slice(0, limit);
}

/**
 * Evolucao do saldo dentro do mes (Secao 7, grafico de linha).
 *
 * Parte do saldo de abertura do periodo e acumula dia a dia. Dias sem
 * movimento repetem o saldo anterior, senao a linha daria saltos que sugerem
 * movimentacao que nao houve.
 */
export function balanceEvolution(params: {
  openingBalanceCents: number;
  transactions: { date: Date; amountCents: number }[];
  monthStart: Date;
  monthEnd: Date;
}): { date: string; balanceCents: number }[] {
  const byDay = new Map<string, number>();

  for (const transaction of params.transactions) {
    const key = transaction.date.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + transaction.amountCents);
  }

  const series: { date: string; balanceCents: number }[] = [];
  let balance = params.openingBalanceCents;

  const cursor = new Date(params.monthStart);
  while (cursor < params.monthEnd) {
    const key = cursor.toISOString().slice(0, 10);
    balance += byDay.get(key) ?? 0;
    series.push({ date: key, balanceCents: balance });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return series;
}
