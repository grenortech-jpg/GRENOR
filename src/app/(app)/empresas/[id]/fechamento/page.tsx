import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import {
  BalanceChart,
  MonthlyFlowChart,
  TopExpensesChart,
} from "@/components/reports/charts";
import {
  ClosingPanel,
  type ClosingChecklist,
} from "@/components/reports/closing-panel";
import { DreTable } from "@/components/reports/dre-table";
import { Indicators } from "@/components/reports/indicators";
import { assertCompanyInWorkspace, getWorkspaceOrThrow } from "@/lib/auth/workspace";
import { formatAmount, formatDate, formatMonth } from "@/lib/format";
import {
  currentMonth,
  monthEnd,
  monthKey as toMonthKey,
  monthStart,
  parseMonthKey,
  previousMonth,
} from "@/lib/period";
import { prisma } from "@/lib/prisma";
import { loadPeriodReport } from "@/lib/reports/load";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Fechamento" };

export default async function ClosingPage({
  params,
  searchParams,
}: PageProps<"/empresas/[id]/fechamento">) {
  const context = await getWorkspaceOrThrow();
  const { id } = await params;
  const company = await assertCompanyInWorkspace(id, context);

  const query = await searchParams;
  const month =
    (typeof query.mes === "string" ? parseMonthKey(query.mes) : null) ??
    currentMonth();
  const monthKey = toMonthKey(month);
  const prior = previousMonth(month);

  const start = monthStart(month);
  const end = monthEnd(month);

  const [report, period, totalCount, pendingCount, accounts] = await Promise.all([
    loadPeriodReport({
      companyId: company.id,
      workspaceId: context.workspace.id,
      month,
    }),
    prisma.period.findUnique({
      where: {
        companyId_year_month: {
          companyId: company.id,
          year: month.year,
          month: month.month,
        },
      },
    }),
    prisma.transaction.count({
      where: { account: { companyId: company.id }, date: { gte: start, lt: end } },
    }),
    prisma.transaction.count({
      where: {
        account: { companyId: company.id },
        date: { gte: start, lt: end },
        categoryId: null,
      },
    }),
    prisma.bankAccount.findMany({ where: { companyId: company.id } }),
  ]);

  const checklist: ClosingChecklist = {
    totalCount,
    pendingCount,
    accountsWithoutOpening: 0,
    transactionsBeforeOpening: report.transactionsBeforeOpening,
    closed: period?.status === "CLOSED",
    closedAt: period?.closedAt ? formatDate(period.closedAt) : null,
  };

  const monthLabel = formatMonth(month.year, month.month);
  const priorLabel = formatMonth(prior.year, prior.month);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/empresas/${company.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {company.name}
        </Link>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {company.name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Relatório de {monthLabel} · {accounts.length} conta(s)
            </p>
          </div>

          <div className="flex gap-2 text-sm">
            <Link
              href={`/empresas/${company.id}/fechamento?mes=${toMonthKey(prior)}`}
              className="rounded-md border px-3 py-1.5 hover:bg-accent"
            >
              ← {priorLabel}
            </Link>
            <Link
              href={`/empresas/${company.id}/conciliacao?mes=${monthKey}`}
              className="rounded-md border px-3 py-1.5 hover:bg-accent"
            >
              Conciliação
            </Link>
          </div>
        </div>
      </div>

      <ClosingPanel
        companyId={company.id}
        monthKey={monthKey}
        monthLabel={monthLabel}
        checklist={checklist}
      />

      {totalCount === 0 ? (
        <div className="rounded-lg border border-dashed px-6 py-16 text-center">
          <h2 className="font-medium">Sem dados em {monthLabel}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Importe um extrato deste mês para ver a DRE.
          </p>
        </div>
      ) : (
        <>
          <section className="space-y-4">
            <h2 className="font-medium">Indicadores do mês</h2>
            <Indicators indicators={report.dre.indicators} />
          </section>

          <section className="space-y-4">
            <h2 className="font-medium">DRE de caixa</h2>
            <DreTable
              report={report.dre}
              currentLabel={monthLabel}
              previousLabel={priorLabel}
            />
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border p-5">
              <h3 className="text-sm font-medium">
                Entradas e saídas · últimos 6 meses
              </h3>
              <div className="mt-4">
                <MonthlyFlowChart data={report.monthlyFlow} />
              </div>
            </div>

            <div className="rounded-lg border p-5">
              <h3 className="text-sm font-medium">Evolução do saldo no mês</h3>
              <div className="mt-4">
                <BalanceChart data={report.balanceSeries} />
              </div>
            </div>
          </section>

          {report.topExpenses.length > 0 && (
            <section className="rounded-lg border p-5">
              <h3 className="text-sm font-medium">Maiores categorias de despesa</h3>
              <div className="mt-4">
                <TopExpensesChart data={report.topExpenses} />
              </div>
            </section>
          )}

          <section className="grid gap-6 lg:grid-cols-2">
            <TransactionList
              title="Maiores saídas"
              rows={report.biggestOutflows}
            />
            <TransactionList
              title="Maiores entradas"
              rows={report.biggestInflows}
            />
          </section>
        </>
      )}
    </div>
  );
}

function TransactionList({
  title,
  rows,
}: {
  title: string;
  rows: {
    date: string;
    description: string;
    categoryName: string | null;
    amountCents: number;
  }[];
}) {
  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg border">
      <h3 className="border-b px-4 py-3 text-sm font-medium">{title}</h3>
      <ul className="divide-y text-sm">
        {rows.map((row, index) => (
          <li key={index} className="flex items-center gap-3 px-4 py-2">
            <span className="w-20 shrink-0 text-xs text-muted-foreground tabular">
              {row.date.split("-").reverse().join("/")}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{row.description}</span>
              <span className="text-xs text-muted-foreground">
                {row.categoryName ?? "sem categoria"}
              </span>
            </span>
            <span
              className={cn(
                "shrink-0 tabular",
                row.amountCents < 0 ? "text-negative" : "text-positive",
              )}
            >
              {row.amountCents < 0 ? "−" : "+"}
              {formatAmount(Math.abs(row.amountCents))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
