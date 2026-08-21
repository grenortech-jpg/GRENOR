"use server";

import { revalidatePath } from "next/cache";

import {
  assertCompanyInWorkspace,
  getWorkspaceOrThrow,
} from "@/lib/auth/workspace";
import { monthEnd, monthStart, parseMonthKey } from "@/lib/period";
import { prisma } from "@/lib/prisma";
import { isAiEnabled } from "@/lib/ai/client";
import { generateSummary } from "@/lib/ai/summarize";
import {
  MAX_SUMMARY_GENERATIONS,
  MAX_SUMMARY_LENGTH,
} from "@/lib/ai/summary-prompt";
import { loadPeriodReport, type PeriodReport } from "@/lib/reports/load";
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

// ---------------------------------------------------------------------------
// Parecer executivo (Secoes 7 e 8.2)
// ---------------------------------------------------------------------------

/**
 * Gera o parecer por IA a partir do snapshot congelado.
 *
 * Le o snapshot, nunca um recalculo ao vivo: o parecer e assinado pelo
 * escritorio e fica na mesma pagina dos numeros. Se o texto descrevesse um
 * calculo novo enquanto a DRE mostra o que foi congelado no fechamento, os
 * dois se contradiriam no documento entregue ao cliente.
 */
export async function generateSummaryAction(
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

  if (!isAiEnabled()) {
    return {
      error:
        "A IA está desligada. Escreva o parecer no campo abaixo ou ative AI_ENABLED no .env.",
    };
  }

  const period = await prisma.period.findUnique({
    where: {
      companyId_year_month: {
        companyId: company.id,
        year: month.year,
        month: month.month,
      },
    },
    include: { report: true },
  });

  if (period?.status !== "CLOSED" || !period.report) {
    return {
      error: "Feche o período antes de gerar o parecer: ele descreve os números congelados.",
    };
  }

  if (period.report.aiRegenerationCount >= MAX_SUMMARY_GENERATIONS) {
    return {
      error: `Limite de ${MAX_SUMMARY_GENERATIONS} gerações por período atingido. Ajuste o texto manualmente no campo abaixo.`,
    };
  }

  const run = await generateSummary({
    workspaceId: context.workspace.id,
    company: company.name,
    report: period.report.snapshotJson as unknown as PeriodReport,
    month,
  });

  if (!run.ok) {
    const motivos: Record<string, string> = {
      billing:
        "A conta da Anthropic está sem créditos. Adicione em console.anthropic.com → Plans & Billing e tente de novo.",
      auth:
        "A chave da Anthropic foi recusada. Confira ANTHROPIC_API_KEY no .env e reinicie o servidor.",
      rate_limit:
        "Limite de requisições da Anthropic atingido. Aguarde alguns instantes e tente de novo.",
      other:
        "A IA não respondeu. Nenhuma geração foi consumida — tente de novo ou escreva o parecer à mão.",
    };
    return { error: motivos[run.reason] };
  }

  // O contador so avanca quando ha texto entregue: cobrar uma das tres
  // geracoes por uma chamada que falhou puniria o usuario pelo erro da API.
  const used = period.report.aiRegenerationCount + 1;

  await prisma.report.update({
    where: { id: period.report.id },
    data: { aiSummary: run.summary, aiRegenerationCount: used },
  });

  revalidatePath(`/empresas/${company.id}/fechamento`);

  const left = MAX_SUMMARY_GENERATIONS - used;

  return {
    success:
      left > 0
        ? `Parecer gerado. Restam ${left} geração(ões) neste período.`
        : "Parecer gerado. Era a última geração por IA deste período; daqui em diante, edição manual.",
  };
}

/**
 * Salva o parecer escrito ou ajustado a mao.
 *
 * Sem limite de uso e sem custo: e o caminho unico quando AI_ENABLED esta
 * desligado (Secao 8.3) e a revisao final quando esta ligado, porque o texto
 * sai assinado pelo escritorio.
 */
export async function saveSummaryAction(
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
    return { error: "Feche o período antes de escrever o parecer." };
  }

  const text = (field(formData, "parecer") ?? "").trim();

  if (text.length > MAX_SUMMARY_LENGTH) {
    return {
      error: `O parecer passou de ${MAX_SUMMARY_LENGTH} caracteres. Um sumário executivo cabe em 300 palavras.`,
    };
  }

  await prisma.report.update({
    where: { id: period.report.id },
    // Texto vazio limpa o parecer: o relatorio omite a secao inteira.
    data: { aiSummary: text.length > 0 ? text : null },
  });

  revalidatePath(`/empresas/${company.id}/fechamento`);

  return {
    success: text.length > 0 ? "Parecer salvo." : "Parecer removido do relatório.",
  };
}
