import "server-only";

import type { WorkspaceContext } from "@/lib/auth/workspace";
import { prisma } from "@/lib/prisma";
import { currentMonth, monthEnd, monthStart, type YearMonth } from "@/lib/period";

/**
 * Status do mes de uma empresa, exibido no grid do workspace (Secao 9):
 *
 *  NO_DATA      nenhum lancamento no mes
 *  RECONCILING  ha lancamentos, o periodo ainda esta aberto
 *  CLOSED       periodo fechado
 */
export type CompanyMonthStatus = "NO_DATA" | "RECONCILING" | "CLOSED";

export type CompanyOverview = {
  id: string;
  name: string;
  cnpj: string | null;
  segment: string | null;
  logoUrl: string | null;
  accountsCount: number;
  transactionsInMonth: number;
  uncategorizedInMonth: number;
  status: CompanyMonthStatus;
};

export const STATUS_LABELS: Record<CompanyMonthStatus, string> = {
  NO_DATA: "Sem dados",
  RECONCILING: "Em conciliação",
  CLOSED: "Fechado",
};

/**
 * Grid do workspace. Faz uma consulta por agregacao em vez de uma por empresa:
 * um BPO com 80 clientes nao pode disparar 240 queries para desenhar a tela.
 */
export async function listCompanyOverviews(
  context: WorkspaceContext,
  options: { search?: string; month?: YearMonth } = {},
): Promise<CompanyOverview[]> {
  const month = options.month ?? currentMonth();
  const search = options.search?.trim();

  const companies = await prisma.company.findMany({
    where: {
      workspaceId: context.workspace.id,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { cnpj: { contains: search.replace(/\D/g, "") || search } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    include: { _count: { select: { accounts: true } } },
  });

  if (companies.length === 0) return [];

  const companyIds = companies.map((company) => company.id);

  const [periods, transactions, uncategorized] = await Promise.all([
    prisma.period.findMany({
      where: {
        companyId: { in: companyIds },
        year: month.year,
        month: month.month,
      },
    }),
    prisma.transaction.groupBy({
      by: ["accountId"],
      where: {
        account: { companyId: { in: companyIds } },
        date: { gte: monthStart(month), lt: monthEnd(month) },
      },
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ["accountId"],
      where: {
        account: { companyId: { in: companyIds } },
        date: { gte: monthStart(month), lt: monthEnd(month) },
        categoryId: null,
      },
      _count: { _all: true },
    }),
  ]);

  const accounts = await prisma.bankAccount.findMany({
    where: { companyId: { in: companyIds } },
    select: { id: true, companyId: true },
  });

  const companyByAccount = new Map(
    accounts.map((account) => [account.id, account.companyId]),
  );

  const tally = (
    rows: { accountId: string; _count: { _all: number } }[],
  ): Map<string, number> => {
    const totals = new Map<string, number>();
    for (const row of rows) {
      const companyId = companyByAccount.get(row.accountId);
      if (!companyId) continue;
      totals.set(companyId, (totals.get(companyId) ?? 0) + row._count._all);
    }
    return totals;
  };

  const totalByCompany = tally(transactions);
  const openByCompany = tally(uncategorized);
  const closedCompanies = new Set(
    periods
      .filter((period) => period.status === "CLOSED")
      .map((period) => period.companyId),
  );

  return companies.map((company) => {
    const transactionsInMonth = totalByCompany.get(company.id) ?? 0;

    const status: CompanyMonthStatus = closedCompanies.has(company.id)
      ? "CLOSED"
      : transactionsInMonth > 0
        ? "RECONCILING"
        : "NO_DATA";

    return {
      id: company.id,
      name: company.name,
      cnpj: company.cnpj,
      segment: company.segment,
      logoUrl: company.logoUrl,
      accountsCount: company._count.accounts,
      transactionsInMonth,
      uncategorizedInMonth: openByCompany.get(company.id) ?? 0,
      status,
    };
  });
}
