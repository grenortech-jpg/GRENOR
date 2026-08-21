import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ChevronRight, FileBarChart, ListChecks, Upload } from "lucide-react";

import { AccountList, type AccountView } from "@/components/accounts/account-list";
import { CompanyStatusBadge } from "@/components/companies/company-card";
import { CompanySettings } from "@/components/companies/company-settings";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { canAdminister, assertCompanyInWorkspace, getWorkspaceOrThrow } from "@/lib/auth/workspace";
import { getCompanyOverview } from "@/lib/companies/overview";
import { listCompanyMonths } from "@/lib/companies/months";
import {
  formatAmount,
  formatDate,
  formatMonth,
  formatCnpj,
  toDateInputValue,
} from "@/lib/format";
import { currentMonth, monthKey } from "@/lib/period";
import { prisma } from "@/lib/prisma";

export async function generateMetadata({
  params,
}: PageProps<"/empresas/[id]">): Promise<Metadata> {
  const context = await getWorkspaceOrThrow();
  const { id } = await params;
  const company = await assertCompanyInWorkspace(id, context);

  return { title: company.name };
}

export default async function CompanyPage({ params }: PageProps<"/empresas/[id]">) {
  const context = await getWorkspaceOrThrow();
  const { id } = await params;

  // Barreira da Secao 3: id da URL so passa se for do workspace.
  const company = await assertCompanyInWorkspace(id, context);

  const month = currentMonth();

  const [accounts, months, overview] = await Promise.all([
    prisma.bankAccount.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { transactions: true } } },
    }),
    listCompanyMonths({
      companyId: company.id,
      workspaceId: context.workspace.id,
    }),
    getCompanyOverview(context, company.id, month),
  ]);

  const accountViews: AccountView[] = accounts.map((account) => ({
    id: account.id,
    bankName: account.bankName,
    nickname: account.nickname,
    openingBalance: formatAmount(account.openingBalanceCents),
    openingBalanceInput: formatAmount(account.openingBalanceCents),
    openingBalanceDate: formatDate(account.openingBalanceDate),
    openingBalanceDateInput: toDateInputValue(account.openingBalanceDate),
    transactionsCount: account._count.transactions,
  }));

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/app"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Empresas
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {company.name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {company.cnpj ? formatCnpj(company.cnpj) : "CNPJ não informado"}
              {company.segment ? ` · ${company.segment}` : ""}
            </p>
          </div>

          <CompanySettings
            company={{
              id: company.id,
              name: company.name,
              cnpj: company.cnpj,
              segment: company.segment,
            }}
            canDelete={canAdminister(context.role)}
          />
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
          <div>
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
              {formatMonth(month.year, month.month)}
              {overview && <CompanyStatusBadge status={overview.status} />}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {overview && overview.transactionsInMonth > 0
                ? `${overview.transactionsInMonth} lançamento(s), ${overview.uncategorizedInMonth} sem categoria.`
                : "Nenhum lançamento importado neste mês."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {overview && overview.transactionsInMonth > 0 && (
              <>
                <Link
                  href={`/empresas/${company.id}/conciliacao`}
                  className={buttonVariants({ size: "sm" })}
                >
                  <ListChecks className="size-4" aria-hidden="true" />
                  Conciliar
                </Link>
                <Link
                  href={`/empresas/${company.id}/fechamento`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <FileBarChart className="size-4" aria-hidden="true" />
                  Relatório
                </Link>
              </>
            )}
            <Link
              href={`/empresas/${company.id}/importar`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Upload className="size-4" aria-hidden="true" />
              Importar extrato
            </Link>
          </div>
        </CardContent>
      </Card>

      <AccountList companyId={company.id} accounts={accountViews} />

      <div className="space-y-3">
        <h2 className="font-medium">Meses com movimento</h2>

        {months.length === 0 ? (
          <p className="rounded-lg border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
            Nenhum lançamento ainda. Importe um extrato para começar.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {months.map((entry) => {
              const key = monthKey(entry);

              // Com pendencia o caminho util e a conciliacao; sem, o relatorio.
              const href =
                entry.pending > 0
                  ? `/empresas/${company.id}/conciliacao?mes=${key}`
                  : `/empresas/${company.id}/fechamento?mes=${key}`;

              return (
                <li key={key}>
                  <Link
                    href={href}
                    className="flex items-center justify-between gap-4 px-4 py-3 text-sm transition-colors hover:bg-accent/40"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">
                        {formatMonth(entry.year, entry.month)}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {entry.total} lançamento(s)
                        {entry.pending > 0
                          ? ` · ${entry.pending} sem categoria`
                          : ""}
                      </span>
                    </span>

                    <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                      {entry.status === "CLOSED"
                        ? "Fechado"
                        : entry.pending > 0
                          ? "Em conciliação"
                          : "Pronto para fechar"}
                      <ChevronRight className="size-4" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
