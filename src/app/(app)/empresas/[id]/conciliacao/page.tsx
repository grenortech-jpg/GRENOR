import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

import { AiCategorizeButton } from "@/components/reconciliation/ai-button";
import { ApplyRulesButton } from "@/components/reconciliation/apply-rules-button";
import { ReconciliationFilters } from "@/components/reconciliation/filters";
import {
  ReconciliationTable,
  type ReconcileRow,
} from "@/components/reconciliation/reconciliation-table";
import {
  TransferSuggestions,
  type TransferSuggestion,
} from "@/components/reconciliation/transfer-suggestions";
import { isAiEnabled } from "@/lib/ai/client";
import { assertCompanyInWorkspace, getWorkspaceOrThrow } from "@/lib/auth/workspace";
import { getWorkspaceCategories, toOptions } from "@/lib/categories/list";
import { formatAmount, formatDate, formatMonth } from "@/lib/format";
import {
  currentMonth,
  monthEnd,
  monthKey as toMonthKey,
  monthStart,
  parseMonthKey,
} from "@/lib/period";
import { prisma } from "@/lib/prisma";
import { findTransferSuggestions } from "./actions";

export const metadata: Metadata = { title: "Conciliação" };

export default async function ReconciliationPage({
  params,
  searchParams,
}: PageProps<"/empresas/[id]/conciliacao">) {
  const context = await getWorkspaceOrThrow();
  const { id } = await params;
  const company = await assertCompanyInWorkspace(id, context);

  const query = await searchParams;
  const month =
    (typeof query.mes === "string" ? parseMonthKey(query.mes) : null) ??
    currentMonth();
  const monthKey = toMonthKey(month);

  const onlyPending = query.filtro === "sem-categoria";
  const accountFilter = typeof query.conta === "string" ? query.conta : "";
  const search = typeof query.busca === "string" ? query.busca.trim() : "";

  const period = { gte: monthStart(month), lt: monthEnd(month) };
  const inCompany = { account: { companyId: company.id } };

  const [accounts, categories, transactions, totalCount, pendingCount, suggestions] =
    await Promise.all([
      prisma.bankAccount.findMany({
        where: { companyId: company.id },
        orderBy: { createdAt: "asc" },
      }),
      getWorkspaceCategories(context),
      prisma.transaction.findMany({
        where: {
          ...inCompany,
          date: period,
          ...(onlyPending ? { categoryId: null } : {}),
          ...(accountFilter ? { accountId: accountFilter } : {}),
          ...(search
            ? { description: { contains: search, mode: "insensitive" as const } }
            : {}),
        },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        include: {
          account: { select: { nickname: true } },
          aiSuggestedCategory: { select: { name: true } },
        },
        take: 2000,
      }),
      prisma.transaction.count({ where: { ...inCompany, date: period } }),
      prisma.transaction.count({
        where: { ...inCompany, date: period, categoryId: null },
      }),
      findTransferSuggestions(company.id, month),
    ]);

  const rows: ReconcileRow[] = transactions.map((transaction) => ({
    id: transaction.id,
    date: formatDate(transaction.date),
    description: transaction.description,
    amount: formatAmount(Math.abs(transaction.amountCents)),
    negative: transaction.amountCents < 0,
    accountNickname: transaction.account.nickname,
    categoryId: transaction.categoryId,
    categorizedBy: transaction.categorizedBy,
    aiConfidence: transaction.aiConfidence,
    isTransfer: transaction.transferPairId !== null,
    suggestedCategoryId: transaction.aiSuggestedCategoryId,
    suggestedCategoryName: transaction.aiSuggestedCategory?.name ?? null,
  }));

  const transferSuggestions: TransferSuggestion[] = suggestions.map((pair) => ({
    outgoingId: pair.outgoing.id,
    incomingId: pair.incoming.id,
    amount: formatAmount(Math.abs(pair.outgoing.amountCents)),
    outgoingDate: formatDate(pair.outgoing.date),
    incomingDate: formatDate(pair.incoming.date),
    outgoingAccount: pair.outgoingAccount ?? "",
    incomingAccount: pair.incomingAccount ?? "",
    outgoingDescription: pair.outgoing.description,
    incomingDescription: pair.incoming.description,
  }));

  const progress =
    totalCount === 0 ? 0 : Math.round(((totalCount - pendingCount) / totalCount) * 100);

  return (
    <div className="space-y-6">
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
            <h1 className="text-2xl font-semibold tracking-tight">Conciliação</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatMonth(month.year, month.month)} · {totalCount} lançamento(s),{" "}
              {pendingCount} sem categoria
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <ApplyRulesButton
              companyId={company.id}
              monthKey={monthKey}
              pendingCount={pendingCount}
            />
            {isAiEnabled() && (
              <AiCategorizeButton
                companyId={company.id}
                monthKey={monthKey}
                pendingCount={pendingCount}
              />
            )}
          </div>
        </div>

        {totalCount > 0 && (
          <div className="mt-4">
            <div
              className="h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progresso da conciliação"
            >
              <div
                className="h-full rounded-full bg-brand transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {progress}% categorizado
              {pendingCount === 0 && " — o período pode ser fechado."}
            </p>
          </div>
        )}
      </div>

      {totalCount === 0 ? (
        <div className="rounded-lg border border-dashed px-6 py-16 text-center">
          <h2 className="font-medium">Nenhum lançamento neste mês</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Importe um extrato para começar a conciliar.
          </p>
          <Link
            href={`/empresas/${company.id}/importar`}
            className="mt-4 inline-block text-sm font-medium underline underline-offset-4"
          >
            Importar extrato
          </Link>
        </div>
      ) : (
        <>
          {transferSuggestions.length > 0 && (
            <TransferSuggestions
              companyId={company.id}
              suggestions={transferSuggestions}
            />
          )}

          <ReconciliationFilters
            accounts={accounts.map((account) => ({
              id: account.id,
              label: `${account.nickname} · ${account.bankName}`,
            }))}
            pendingCount={pendingCount}
            totalCount={totalCount}
          />

          {rows.length === 0 ? (
            <div className="rounded-lg border border-dashed px-6 py-12 text-center">
              {onlyPending && pendingCount === 0 ? (
                <>
                  <CheckCircle2
                    className="mx-auto size-8 text-positive"
                    aria-hidden="true"
                  />
                  <h2 className="mt-3 font-medium">Tudo categorizado</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Nenhum lançamento pendente neste mês.
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhum lançamento corresponde aos filtros.
                </p>
              )}
            </div>
          ) : (
            <ReconciliationTable
              companyId={company.id}
              monthKey={monthKey}
              rows={rows}
              categories={toOptions(categories)}
            />
          )}
        </>
      )}
    </div>
  );
}
