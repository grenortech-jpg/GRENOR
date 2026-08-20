"use server";

import { revalidatePath } from "next/cache";

import {
  assertCompanyInWorkspace,
  getWorkspaceOrThrow,
} from "@/lib/auth/workspace";
import { monthEnd, monthStart, parseMonthKey } from "@/lib/period";
import { prisma } from "@/lib/prisma";
import { loadPeriodReport } from "@/lib/reports/load";
import { field, firstIssue, parseId } from "@/lib/validation/schemas";

export type ClosingState = {
  error?: string;
  success?: string;
};

/**
 * Fechamento do periodo (Secao 5.5).
 *
 * Duas regras que o resto do produto depende:
 *
 *  - So fecha com 100% das transacoes categorizadas. Um lancamento pendente
 *    significa um numero faltando na DRE que o cliente vai receber.
 *  - Fechar congela um snapshot. O relatorio precisa continuar mostrando o que
 *    foi aprovado, mesmo que alguem edite um lancamento depois - e por isso
 *    que reabrir e um passo explicito.
 */
export async function closePeriodAction(
  _prevState: ClosingState,
  formData: FormData,
): Promise<ClosingState> {
  const context = await getWorkspaceOrThrow();

  const companyId = parseId(formData, "companyId");
  if (!companyId.success) return { error: firstIssue(companyId.error) };
  const company = await assertCompanyInWorkspace(companyId.data, context);

  const monthValue = field(formData, "mes");
  const month = monthValue ? parseMonthKey(monthValue) : null;
  if (!month) return { error: "Período inválido." };

  const start = monthStart(month);
  const end = monthEnd(month);

  const [total, pending] = await Promise.all([
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
  ]);

  if (total === 0) {
    return { error: "Não há lançamentos neste período para fechar." };
  }

  if (pending > 0) {
    return {
      error: `Ainda há ${pending} lançamento(s) sem categoria. O período só fecha com tudo categorizado.`,
    };
  }

  const report = await loadPeriodReport({
    companyId: company.id,
    workspaceId: context.workspace.id,
    month,
  });

  const period = await prisma.period.upsert({
    where: {
      companyId_year_month: {
        companyId: company.id,
        year: month.year,
        month: month.month,
      },
    },
    create: {
      companyId: company.id,
      year: month.year,
      month: month.month,
      status: "CLOSED",
      closedAt: new Date(),
    },
    update: { status: "CLOSED", closedAt: new Date() },
  });

  // O snapshot e o que o relatorio le dali em diante (Secao 5.5).
  await prisma.report.upsert({
    where: { periodId: period.id },
    create: {
      periodId: period.id,
      snapshotJson: report as unknown as object,
      generatedAt: new Date(),
    },
    update: {
      snapshotJson: report as unknown as object,
      generatedAt: new Date(),
    },
  });

  revalidatePath(`/empresas/${company.id}/fechamento`);
  revalidatePath(`/empresas/${company.id}`);
  revalidatePath("/app");

  return { success: "Período fechado. Os números foram congelados." };
}

/** Reabre o periodo para edicao. O snapshot antigo permanece ate refechar. */
export async function reopenPeriodAction(
  _prevState: ClosingState,
  formData: FormData,
): Promise<ClosingState> {
  const context = await getWorkspaceOrThrow();

  const companyId = parseId(formData, "companyId");
  if (!companyId.success) return { error: firstIssue(companyId.error) };
  const company = await assertCompanyInWorkspace(companyId.data, context);

  const monthValue = field(formData, "mes");
  const month = monthValue ? parseMonthKey(monthValue) : null;
  if (!month) return { error: "Período inválido." };

  const period = await prisma.period.findUnique({
    where: {
      companyId_year_month: {
        companyId: company.id,
        year: month.year,
        month: month.month,
      },
    },
  });

  if (!period) return { error: "Período não encontrado." };

  await prisma.period.update({
    where: { id: period.id },
    data: { status: "OPEN", closedAt: null },
  });

  revalidatePath(`/empresas/${company.id}/fechamento`);
  revalidatePath(`/empresas/${company.id}`);
  revalidatePath("/app");

  return {
    success:
      "Período reaberto. Depois de ajustar, feche de novo para atualizar os números do relatório.",
  };
}

// ---------------------------------------------------------------------------
// Compartilhamento (Secao 7)
// ---------------------------------------------------------------------------

/**
 * Liga ou desliga o link publico do relatorio.
 *
 * O token e gerado na criacao do Report e nao muda ao desligar: religar
 * reaproveita o mesmo endereco, para quem ja tem o link nao perder o acesso a
 * troco de nada. Quem quiser invalidar de vez usa a rotacao abaixo.
 */
export async function toggleShareAction(
  _prevState: ClosingState,
  formData: FormData,
): Promise<ClosingState> {
  const context = await getWorkspaceOrThrow();

  const companyId = parseId(formData, "companyId");
  if (!companyId.success) return { error: firstIssue(companyId.error) };
  const company = await assertCompanyInWorkspace(companyId.data, context);

  const periodId = parseId(formData, "periodId");
  if (!periodId.success) return { error: firstIssue(periodId.error) };

  const period = await prisma.period.findFirst({
    where: { id: periodId.data, company: { workspaceId: context.workspace.id } },
    include: { report: true },
  });

  if (!period?.report) {
    return { error: "Gere o relatório antes de compartilhar." };
  }

  if (period.status !== "CLOSED") {
    return {
      error: "Só é possível compartilhar um período fechado.",
    };
  }

  const enabled = field(formData, "enabled") === "true";

  await prisma.report.update({
    where: { id: period.report.id },
    data: { shareEnabled: enabled },
  });

  revalidatePath(`/empresas/${company.id}/fechamento`);

  return {
    success: enabled
      ? "Link ativado. Qualquer pessoa com o endereço vê o relatório."
      : "Link desativado. O endereço deixa de funcionar imediatamente.",
  };
}

/** Gera um token novo, invalidando qualquer link ja distribuido. */
export async function rotateShareTokenAction(
  _prevState: ClosingState,
  formData: FormData,
): Promise<ClosingState> {
  const context = await getWorkspaceOrThrow();

  const companyId = parseId(formData, "companyId");
  if (!companyId.success) return { error: firstIssue(companyId.error) };
  const company = await assertCompanyInWorkspace(companyId.data, context);

  const periodId = parseId(formData, "periodId");
  if (!periodId.success) return { error: firstIssue(periodId.error) };

  const period = await prisma.period.findFirst({
    where: { id: periodId.data, company: { workspaceId: context.workspace.id } },
    include: { report: true },
  });

  if (!period?.report) return { error: "Relatório não encontrado." };

  await prisma.report.update({
    where: { id: period.report.id },
    data: { shareToken: crypto.randomUUID() },
  });

  revalidatePath(`/empresas/${company.id}/fechamento`);

  return { success: "Novo link gerado. O anterior deixou de funcionar." };
}
