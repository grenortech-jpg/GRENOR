import "server-only";

import { prisma } from "@/lib/prisma";
import { monthEnd, monthStart, previousMonth, type YearMonth } from "@/lib/period";
import {
  balanceEvolution,
  buildDre,
  topExpenseCategories,
  type DreCategory,
  type DreReport,
} from "@/lib/reports/dre";

/**
 * Carrega do banco tudo que o relatorio do periodo precisa.
 *
 * O calculo em si fica em dre.ts, sem banco, para poder ser testado. Aqui e so
 * a busca dos dados e o saldo consolidado das contas.
 */

export type MonthlyFlow = {
  year: number;
  month: number;
  inflowCents: number;
  outflowCents: number;
};

export type PeriodReport = {
  dre: DreReport;
  topExpenses: { name: string; cents: number }[];
  balanceSeries: { date: string; balanceCents: number }[];
  monthlyFlow: MonthlyFlow[];
  biggestOutflows: ReportTransaction[];
  biggestInflows: ReportTransaction[];
  /**
   * Lancamentos anteriores a data do saldo inicial de alguma conta.
   * Sinaliza saldo inicial mal cadastrado, que desalinha o saldo consolidado.
   */
  transactionsBeforeOpening: number;
};

export type ReportTransaction = {
  date: string;
  description: string;
  categoryName: string | null;
  amountCents: number;
};

/**
 * Saldo consolidado das contas ao fim do periodo (Secao 7).
 *
 * Cada conta parte do proprio saldo inicial e acumula o que veio DEPOIS da
 * data desse saldo - o saldo inicial e o saldo da vespera do primeiro extrato,
 * entao contar lancamentos anteriores a ele somaria duas vezes o mesmo
 * dinheiro.
 */
async function consolidatedBalance(
  companyId: string,
  until: Date,
): Promise<{ balanceCents: number; before: number }> {
  const accounts = await prisma.bankAccount.findMany({
    where: { companyId },
    select: { id: true, openingBalanceCents: true, openingBalanceDate: true },
  });

  let balanceCents = 0;
  let before = 0;

  for (const account of accounts) {
    const [after, prior] = await Promise.all([
      prisma.transaction.aggregate({
        where: {
          accountId: account.id,
          date: { gt: account.openingBalanceDate, lt: until },
        },
        _sum: { amountCents: true },
      }),
      prisma.transaction.count({
        where: {
          accountId: account.id,
          date: { lte: account.openingBalanceDate },
        },
      }),
    ]);

    balanceCents += account.openingBalanceCents + (after._sum.amountCents ?? 0);
    before += prior;
  }

  return { balanceCents, before };
}

/** Saldo consolidado na abertura do periodo, para a linha de evolucao. */
async function openingBalanceForMonth(
  companyId: string,
  start: Date,
): Promise<number> {
  const { balanceCents } = await consolidatedBalance(companyId, start);
  return balanceCents;
}

export async function loadPeriodReport(params: {
  companyId: string;
  workspaceId: string;
  month: YearMonth;
}): Promise<PeriodReport> {
  const { companyId, month } = params;
  const start = monthStart(month);
  const end = monthEnd(month);
  const prior = previousMonth(month);

  const [rawCategories, current, previous, balance, openingBalance] =
    await Promise.all([
      prisma.category.findMany({ where: { workspaceId: params.workspaceId } }),
      prisma.transaction.findMany({
        where: { account: { companyId }, date: { gte: start, lt: end } },
        select: {
          categoryId: true,
          amountCents: true,
          date: true,
          description: true,
          category: { select: { name: true } },
        },
        orderBy: { date: "asc" },
      }),
      prisma.transaction.findMany({
        where: {
          account: { companyId },
          date: { gte: monthStart(prior), lt: monthEnd(prior) },
        },
        select: { categoryId: true, amountCents: true },
      }),
      consolidatedBalance(companyId, end),
      openingBalanceForMonth(companyId, start),
    ]);

  const categories: DreCategory[] = rawCategories.map((category) => ({
    id: category.id,
    name: category.name,
    group: category.group,
    sortOrder: category.sortOrder,
    isTransferNeutral: category.isTransferNeutral,
  }));

  const dre = buildDre({
    categories,
    current,
    previous,
    closingBalanceCents: balance.balanceCents,
  });

  const sorted = [...current].sort((a, b) => a.amountCents - b.amountCents);
  const toReportTransaction = (
    transaction: (typeof current)[number],
  ): ReportTransaction => ({
    date: transaction.date.toISOString().slice(0, 10),
    description: transaction.description,
    categoryName: transaction.category?.name ?? null,
    amountCents: transaction.amountCents,
  });

  return {
    dre,
    topExpenses: topExpenseCategories({ categories, transactions: current }),
    balanceSeries: balanceEvolution({
      openingBalanceCents: openingBalance,
      transactions: current,
      monthStart: start,
      monthEnd: end,
    }),
    monthlyFlow: await loadMonthlyFlow(companyId, month, categories),
    biggestOutflows: sorted
      .filter((transaction) => transaction.amountCents < 0)
      .slice(0, 10)
      .map(toReportTransaction),
    biggestInflows: [...sorted]
      .reverse()
      .filter((transaction) => transaction.amountCents > 0)
      .slice(0, 10)
      .map(toReportTransaction),
    transactionsBeforeOpening: balance.before,
  };
}

/**
 * Entradas e saidas dos ultimos seis meses (Secao 7, grafico de barras).
 *
 * Uma consulta so, agrupada em memoria: seis consultas separadas seriam seis
 * idas ao banco para desenhar um grafico.
 */
async function loadMonthlyFlow(
  companyId: string,
  month: YearMonth,
  categories: DreCategory[],
): Promise<MonthlyFlow[]> {
  const months: YearMonth[] = [];
  let cursor = month;
  for (let index = 0; index < 6; index += 1) {
    months.unshift(cursor);
    cursor = previousMonth(cursor);
  }

  const neutralIds = new Set(
    categories.filter((category) => category.isTransferNeutral).map((c) => c.id),
  );

  const transactions = await prisma.transaction.findMany({
    where: {
      account: { companyId },
      date: { gte: monthStart(months[0]), lt: monthEnd(month) },
    },
    select: { date: true, amountCents: true, categoryId: true },
  });

  return months.map((target) => {
    const inMonth = transactions.filter(
      (transaction) =>
        transaction.date.getUTCFullYear() === target.year &&
        transaction.date.getUTCMonth() + 1 === target.month &&
        !(transaction.categoryId && neutralIds.has(transaction.categoryId)),
    );

    return {
      year: target.year,
      month: target.month,
      inflowCents: inMonth
        .filter((transaction) => transaction.amountCents > 0)
        .reduce((total, transaction) => total + transaction.amountCents, 0),
      outflowCents: Math.abs(
        inMonth
          .filter((transaction) => transaction.amountCents < 0)
          .reduce((total, transaction) => total + transaction.amountCents, 0),
      ),
    };
  });
}
