import "server-only";

import type { ReportData } from "@/lib/reports/report-html";
import { assertCompanyInWorkspace, type WorkspaceContext } from "@/lib/auth/workspace";
import { prisma } from "@/lib/prisma";
import { parseMonthKey, type YearMonth } from "@/lib/period";
import { loadPeriodReport, type PeriodReport } from "@/lib/reports/load";

/**
 * Monta os dados do relatorio de um periodo.
 *
 * Quando o periodo esta fechado, os numeros vem do snapshot congelado no
 * fechamento (Secao 5.5) - e o que garante que o relatorio entregue ao cliente
 * continue mostrando o que foi aprovado, mesmo que alguem edite um lancamento
 * depois. Periodo aberto calcula ao vivo, para o preview refletir a edicao.
 */
export async function buildReportProps(params: {
  companyId: string;
  workspaceId: string;
  month: YearMonth;
}): Promise<ReportData> {
  const [company, workspace, period] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: params.companyId } }),
    prisma.workspace.findUniqueOrThrow({ where: { id: params.workspaceId } }),
    prisma.period.findUnique({
      where: {
        companyId_year_month: {
          companyId: params.companyId,
          year: params.month.year,
          month: params.month.month,
        },
      },
      include: { report: true },
    }),
  ]);

  const frozen =
    period?.status === "CLOSED" && period.report?.snapshotJson
      ? (period.report.snapshotJson as unknown as PeriodReport)
      : null;

  const report =
    frozen ??
    (await loadPeriodReport({
      companyId: params.companyId,
      workspaceId: params.workspaceId,
      month: params.month,
    }));

  return {
    company: {
      name: company.name,
      cnpj: company.cnpj,
      logoUrl: company.logoUrl,
    },
    workspace: { name: workspace.name, logoUrl: workspace.logoUrl },
    month: params.month,
    report,
    summary: period?.report?.aiSummary ?? null,
    generatedAt: period?.report?.generatedAt ?? new Date(),
  };
}

/** Resolve o periodo a partir do contexto e da URL, validando o pertencimento. */
export async function resolveReportTarget(params: {
  context: WorkspaceContext;
  companyId: string;
  monthKey: string;
}) {
  const company = await assertCompanyInWorkspace(params.companyId, params.context);
  const month = parseMonthKey(params.monthKey);

  if (!month) return null;

  return { company, month };
}
