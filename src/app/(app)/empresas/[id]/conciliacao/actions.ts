"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { RuleMatchType } from "@/generated/prisma/enums";
import {
  assertCategoryInWorkspace,
  assertCompanyInWorkspace,
  assertTransactionsInWorkspace,
  getWorkspaceOrThrow,
} from "@/lib/auth/workspace";
import { findTransferCategory, getWorkspaceCategories } from "@/lib/categories/list";
import { monthEnd, monthStart, parseMonthKey } from "@/lib/period";
import { prisma } from "@/lib/prisma";
import { applyRules, validatePattern } from "@/lib/rules/engine";
import { lookupCnpjProfile } from "@/lib/categorization/cnpj-lookup";
import { recallCategorizations, rememberCategorizations } from "@/lib/categorization/memory";
import { logResolution, resolveCategories } from "@/lib/categorization/resolve";
import { detectTransferPairs } from "@/lib/transactions/transfers";
import { categorizeWithAi } from "@/lib/ai/categorize";
import { isAiEnabled } from "@/lib/ai/client";
import { CONFIDENCE_THRESHOLD } from "@/lib/ai/prompt";
import { CATEGORY_GROUP_LABELS } from "@/lib/categories/default-plan";
import { field, firstIssue, parseId } from "@/lib/validation/schemas";

export type ReconcileState = {
  error?: string;
  success?: string;
};

const idListSchema = z
  .array(z.string().uuid())
  .min(1, "Selecione ao menos um lançamento.");

function readIds(formData: FormData, name = "transactionIds"): string[] {
  return formData
    .getAll(name)
    .filter((value): value is string => typeof value === "string");
}

/** Periodo alvo, vindo da URL da tela. */
function readMonth(formData: FormData) {
  const value = field(formData, "mes");
  return value ? parseMonthKey(value) : null;
}

function revalidateCompany(companyId: string) {
  revalidatePath(`/empresas/${companyId}/conciliacao`);
  revalidatePath(`/empresas/${companyId}`);
  revalidatePath("/app");
}

// ---------------------------------------------------------------------------
// Categorizacao
// ---------------------------------------------------------------------------

/** Categorizacao manual, de um ou de muitos lancamentos. */
export async function categorizeAction(
  _prevState: ReconcileState,
  formData: FormData,
): Promise<ReconcileState> {
  const context = await getWorkspaceOrThrow();

  const companyId = parseId(formData, "companyId");
  if (!companyId.success) return { error: firstIssue(companyId.error) };
  const company = await assertCompanyInWorkspace(companyId.data, context);

  const ids = idListSchema.safeParse(readIds(formData));
  if (!ids.success) return { error: firstIssue(ids.error) };

  await assertTransactionsInWorkspace(ids.data, context);

  const categoryValue = field(formData, "categoryId");

  // "" significa limpar a categoria, e nao um id invalido.
  if (!categoryValue) {
    await prisma.transaction.updateMany({
      where: { id: { in: ids.data } },
      data: { categoryId: null, categorizedBy: "NONE", aiConfidence: null },
    });

    revalidateCompany(company.id);
    return { success: `${ids.data.length} lançamento(s) sem categoria.` };
  }

  const categoryId = parseId(formData, "categoryId");
  if (!categoryId.success) return { error: firstIssue(categoryId.error) };

  await assertCategoryInWorkspace(categoryId.data, context);

  const [, corrected] = await prisma.$transaction([
    prisma.transaction.updateMany({
      where: { id: { in: ids.data } },
      data: {
        categoryId: categoryId.data,
        categorizedBy: "MANUAL",
        aiConfidence: null,
      },
    }),
    prisma.transaction.findMany({
      where: { id: { in: ids.data } },
      select: { description: true },
    }),
  ]);

  // Toda confirmacao humana alimenta a memoria do workspace (Fase 11).
  await rememberCategorizations(
    context.workspace.id,
    corrected.map((row) => ({ description: row.description, categoryId: categoryId.data })),
  );

  revalidateCompany(company.id);
  return { success: `${ids.data.length} lançamento(s) categorizado(s).` };
}

/**
 * Categorizacao automatica na ordem da Fase 11: memoria do workspace ->
 * CNPJ/CNAE -> regras. So toca no que ainda nao tem categoria; a IA e o
 * humano ficam com o resto.
 */
export async function autoCategorizeAction(
  _prevState: ReconcileState,
  formData: FormData,
): Promise<ReconcileState> {
  const context = await getWorkspaceOrThrow();

  const companyId = parseId(formData, "companyId");
  if (!companyId.success) return { error: firstIssue(companyId.error) };
  const company = await assertCompanyInWorkspace(companyId.data, context);

  const month = readMonth(formData);

  const [rules, categories, pending] = await Promise.all([
    prisma.categoryRule.findMany({
      where: { workspaceId: context.workspace.id, active: true },
    }),
    prisma.category.findMany({
      where: { workspaceId: context.workspace.id },
      select: { id: true, defaultId: true },
    }),
    prisma.transaction.findMany({
      where: {
        account: { companyId: company.id },
        categoryId: null,
        ...(month
          ? { date: { gte: monthStart(month), lt: monthEnd(month) } }
          : {}),
      },
      select: { id: true, description: true, amountCents: true },
    }),
  ]);

  if (pending.length === 0) {
    return { success: "Nada a categorizar: todos os lançamentos já têm categoria." };
  }

  const { assignments, counts } = await resolveCategories({
    transactions: pending,
    rules,
    categories,
    recall: (keys) => recallCategorizations(context.workspace.id, keys),
    lookupCnpj: lookupCnpjProfile,
  });

  logResolution(context.workspace.id, counts);

  if (assignments.length === 0) {
    return {
      success: `Nenhum dos ${pending.length} lançamentos pendentes foi reconhecido pela memória, por CNPJ ou pelas ${rules.length} regra(s).`,
    };
  }

  // Um updateMany por (categoria, origem), nao um por lancamento.
  const buckets = new Map<string, { categoryId: string; source: typeof assignments[number]["source"]; ids: string[] }>();
  for (const assignment of assignments) {
    const key = `${assignment.categoryId}|${assignment.source}`;
    const bucket = buckets.get(key) ?? { categoryId: assignment.categoryId, source: assignment.source, ids: [] };
    bucket.ids.push(assignment.transactionId);
    buckets.set(key, bucket);
  }

  await prisma.$transaction(
    [...buckets.values()].map((bucket) =>
      prisma.transaction.updateMany({
        where: { id: { in: bucket.ids } },
        data: { categoryId: bucket.categoryId, categorizedBy: bucket.source, aiConfidence: null },
      }),
    ),
  );

  revalidateCompany(company.id);

  const partes = [
    counts.memory > 0 ? `${counts.memory} pela memória` : null,
    counts.cnpj > 0 ? `${counts.cnpj} por CNPJ` : null,
    counts.rules > 0 ? `${counts.rules} pelas regras` : null,
  ].filter(Boolean);

  return {
    success:
      `${assignments.length} lançamento(s) categorizado(s): ${partes.join(", ")}.` +
      (counts.pending > 0 ? ` ${counts.pending} ainda sem categoria.` : ""),
  };
}

/**
 * Camada 1 da Secao 5.3: aplica as regras do workspace.
 *
 * So toca no que ainda nao tem categoria. Correcao manual e decisao do
 * usuario, e regra nenhuma pode sobrescrever isso.
 */
export async function applyRulesAction(
  _prevState: ReconcileState,
  formData: FormData,
): Promise<ReconcileState> {
  const context = await getWorkspaceOrThrow();

  const companyId = parseId(formData, "companyId");
  if (!companyId.success) return { error: firstIssue(companyId.error) };
  const company = await assertCompanyInWorkspace(companyId.data, context);

  const month = readMonth(formData);

  const [rules, pending] = await Promise.all([
    prisma.categoryRule.findMany({
      where: { workspaceId: context.workspace.id, active: true },
    }),
    prisma.transaction.findMany({
      where: {
        account: { companyId: company.id },
        categoryId: null,
        ...(month
          ? { date: { gte: monthStart(month), lt: monthEnd(month) } }
          : {}),
      },
      select: { id: true, description: true },
    }),
  ]);

  if (rules.length === 0) {
    return {
      error:
        "Nenhuma regra cadastrada ainda. Corrija um lançamento e escolha 'criar regra' para começar.",
    };
  }

  if (pending.length === 0) {
    return { success: "Nada a categorizar: todos os lançamentos já têm categoria." };
  }

  const results = applyRules(pending, rules);

  if (results.length === 0) {
    return {
      success: `Nenhuma das ${rules.length} regras casou com os ${pending.length} lançamentos pendentes.`,
    };
  }

  // Agrupa por categoria: um updateMany por categoria em vez de um por
  // lancamento. Com 1.000 pendentes a diferenca e de segundos.
  const byCategory = new Map<string, string[]>();
  for (const result of results) {
    const bucket = byCategory.get(result.categoryId) ?? [];
    bucket.push(result.transactionId);
    byCategory.set(result.categoryId, bucket);
  }

  await prisma.$transaction(
    [...byCategory.entries()].map(([categoryId, transactionIds]) =>
      prisma.transaction.updateMany({
        where: { id: { in: transactionIds } },
        data: { categoryId, categorizedBy: "RULE", aiConfidence: null },
      }),
    ),
  );

  revalidateCompany(company.id);

  const restantes = pending.length - results.length;
  return {
    success:
      `${results.length} lançamento(s) categorizado(s) pelas regras.` +
      (restantes > 0 ? ` ${restantes} ainda sem categoria.` : ""),
  };
}

// ---------------------------------------------------------------------------
// Regras
// ---------------------------------------------------------------------------

const matchTypeSchema = z.enum(["CONTAINS", "STARTS_WITH", "REGEX"]);

/**
 * "Criar regra a partir desta correcao" (Secao 5.3).
 *
 * Categoriza o lancamento e grava a regra na mesma operacao, e ja aplica a
 * regra recem-criada ao restante do periodo - e o que faz a correcao valer
 * para o mes inteiro, e nao so para a linha que o usuario clicou.
 */
export async function createRuleAction(
  _prevState: ReconcileState,
  formData: FormData,
): Promise<ReconcileState> {
  const context = await getWorkspaceOrThrow();

  const companyId = parseId(formData, "companyId");
  if (!companyId.success) return { error: firstIssue(companyId.error) };
  const company = await assertCompanyInWorkspace(companyId.data, context);

  const categoryId = parseId(formData, "categoryId");
  if (!categoryId.success) return { error: firstIssue(categoryId.error) };
  await assertCategoryInWorkspace(categoryId.data, context);

  const matchType = matchTypeSchema.safeParse(field(formData, "matchType"));
  if (!matchType.success) return { error: "Tipo de comparação inválido." };

  const pattern = (field(formData, "pattern") ?? "").trim();
  const validation = validatePattern(matchType.data as RuleMatchType, pattern);
  if (!validation.ok) return { error: validation.reason };

  const priority = Number(field(formData, "priority") ?? "100");

  await prisma.categoryRule.create({
    data: {
      workspaceId: context.workspace.id,
      categoryId: categoryId.data,
      matchType: matchType.data,
      pattern,
      priority: Number.isFinite(priority) ? priority : 100,
      active: true,
    },
  });

  // O lancamento corrigido (quando informado) entra na memoria: foi um humano
  // que decidiu a categoria.
  const corrected = readIds(formData);
  if (corrected.length > 0) {
    await assertTransactionsInWorkspace(corrected, context);
    const rows = await prisma.transaction.findMany({
      where: { id: { in: corrected } },
      select: { description: true },
    });
    await rememberCategorizations(
      context.workspace.id,
      rows.map((row) => ({ description: row.description, categoryId: categoryId.data })),
    );
  }

  // Aplica de imediato ao que estiver pendente na empresa.
  const applyResult = await applyRulesAction({}, formData);

  revalidateCompany(company.id);

  return {
    success: `Regra criada. ${applyResult.success ?? ""}`.trim(),
  };
}

export async function updateRuleAction(
  _prevState: ReconcileState,
  formData: FormData,
): Promise<ReconcileState> {
  const context = await getWorkspaceOrThrow();

  const ruleId = parseId(formData, "ruleId");
  if (!ruleId.success) return { error: firstIssue(ruleId.error) };

  const rule = await prisma.categoryRule.findFirst({
    where: { id: ruleId.data, workspaceId: context.workspace.id },
  });
  if (!rule) return { error: "Regra não encontrada." };

  const categoryId = parseId(formData, "categoryId");
  if (!categoryId.success) return { error: firstIssue(categoryId.error) };
  await assertCategoryInWorkspace(categoryId.data, context);

  const matchType = matchTypeSchema.safeParse(field(formData, "matchType"));
  if (!matchType.success) return { error: "Tipo de comparação inválido." };

  const pattern = (field(formData, "pattern") ?? "").trim();
  const validation = validatePattern(matchType.data as RuleMatchType, pattern);
  if (!validation.ok) return { error: validation.reason };

  const priority = Number(field(formData, "priority") ?? "100");

  await prisma.categoryRule.update({
    where: { id: rule.id },
    data: {
      categoryId: categoryId.data,
      matchType: matchType.data,
      pattern,
      priority: Number.isFinite(priority) ? priority : 100,
      active: field(formData, "active") === "on",
    },
  });

  revalidatePath("/configuracoes/regras");
  return { success: "Regra atualizada." };
}

export async function deleteRuleAction(
  _prevState: ReconcileState,
  formData: FormData,
): Promise<ReconcileState> {
  const context = await getWorkspaceOrThrow();

  const ruleId = parseId(formData, "ruleId");
  if (!ruleId.success) return { error: firstIssue(ruleId.error) };

  const rule = await prisma.categoryRule.findFirst({
    where: { id: ruleId.data, workspaceId: context.workspace.id },
  });
  if (!rule) return { error: "Regra não encontrada." };

  await prisma.categoryRule.delete({ where: { id: rule.id } });

  revalidatePath("/configuracoes/regras");
  return { success: "Regra removida." };
}


// ---------------------------------------------------------------------------
// Categorizacao por IA (Secao 5.3, camada 2)
// ---------------------------------------------------------------------------

/**
 * Roda a IA sobre o que sobrou depois das regras.
 *
 * Nada aqui e caminho obrigatorio: com AI_ENABLED desligado a acao devolve uma
 * mensagem e a conciliacao manual segue igual (Secao 8.3).
 */
export async function categorizeWithAiAction(
  _prevState: ReconcileState,
  formData: FormData,
): Promise<ReconcileState> {
  const context = await getWorkspaceOrThrow();

  const companyId = parseId(formData, "companyId");
  if (!companyId.success) return { error: firstIssue(companyId.error) };
  const company = await assertCompanyInWorkspace(companyId.data, context);

  if (!isAiEnabled()) {
    return {
      error:
        "IA desligada. Defina AI_ENABLED=true e ANTHROPIC_API_KEY no .env para usar a categorização assistida.",
    };
  }

  const month = readMonth(formData);

  const [categories, pending] = await Promise.all([
    getWorkspaceCategories(context),
    prisma.transaction.findMany({
      where: {
        account: { companyId: company.id },
        categoryId: null,
        ...(month
          ? { date: { gte: monthStart(month), lt: monthEnd(month) } }
          : {}),
      },
      select: { id: true, date: true, amountCents: true, description: true },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  if (pending.length === 0) {
    return { success: "Nada a categorizar: todos os lançamentos já têm categoria." };
  }

  const run = await categorizeWithAi({
    workspaceId: context.workspace.id,
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      groupLabel: CATEGORY_GROUP_LABELS[category.group],
    })),
    transactions: pending,
  });

  // Falha que o usuario resolve sozinho merece a instrucao, nao um numero.
  if (run.suggestions.length === 0 && run.failureReason) {
    const motivos: Record<string, string> = {
      billing:
        "A conta da Anthropic está sem créditos. Adicione em console.anthropic.com → Plans & Billing e tente de novo.",
      auth:
        "A chave da Anthropic foi recusada. Confira ANTHROPIC_API_KEY no .env e reinicie o servidor.",
      rate_limit:
        "Limite de requisições da Anthropic atingido. Aguarde alguns instantes e tente de novo.",
      other:
        "A IA não respondeu. Os lançamentos seguem sem categoria — tente de novo em instantes ou categorize manualmente.",
    };
    return { error: motivos[run.failureReason] };
  }

  const applied = run.suggestions.filter((s) => s.apply);
  const suggested = run.suggestions.filter((s) => !s.apply);

  await prisma.$transaction([
    ...applied.map((suggestion) =>
      prisma.transaction.update({
        where: { id: suggestion.transactionId },
        data: {
          categoryId: suggestion.categoryId,
          categorizedBy: "AI" as const,
          aiConfidence: suggestion.confidence,
          aiSuggestedCategoryId: null,
        },
      }),
    ),
    // Abaixo do limiar fica como sugestao destacada, e o lancamento continua
    // pendente: o periodo nao pode fechar com um palpite dentro da DRE.
    ...suggested.map((suggestion) =>
      prisma.transaction.update({
        where: { id: suggestion.transactionId },
        data: {
          aiSuggestedCategoryId: suggestion.categoryId,
          aiConfidence: suggestion.confidence,
        },
      }),
    ),
  ]);

  revalidateCompany(company.id);

  const partes = [
    `${applied.length} categorizado(s) pela IA`,
    suggested.length > 0
      ? `${suggested.length} com sugestão abaixo de ${Math.round(CONFIDENCE_THRESHOLD * 100)}% para você revisar`
      : null,
    run.batchesFailed > 0
      ? `${run.batchesFailed} lote(s) falharam e ficaram sem categoria`
      : null,
    run.skipped > 0
      ? `${run.skipped} lançamento(s) ficaram para a próxima rodada (limite por clique)`
      : null,
  ].filter(Boolean);

  return { success: partes.join(". ") + "." };
}

/** Aceita a sugestao da IA de um lancamento, promovendo-a a categoria. */
export async function acceptSuggestionAction(
  _prevState: ReconcileState,
  formData: FormData,
): Promise<ReconcileState> {
  const context = await getWorkspaceOrThrow();

  const companyId = parseId(formData, "companyId");
  if (!companyId.success) return { error: firstIssue(companyId.error) };
  const company = await assertCompanyInWorkspace(companyId.data, context);

  const transactionId = parseId(formData, "transactionId");
  if (!transactionId.success) return { error: firstIssue(transactionId.error) };

  await assertTransactionsInWorkspace([transactionId.data], context);

  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId.data },
  });

  if (!transaction?.aiSuggestedCategoryId) {
    return { error: "Este lançamento não tem sugestão da IA." };
  }

  await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      categoryId: transaction.aiSuggestedCategoryId,
      categorizedBy: "AI",
      aiSuggestedCategoryId: null,
    },
  });

  // Aceitar a sugestao e uma confirmacao humana: vai para a memoria.
  await rememberCategorizations(context.workspace.id, [
    { description: transaction.description, categoryId: transaction.aiSuggestedCategoryId },
  ]);

  revalidateCompany(company.id);
  return { success: "Sugestão aceita." };
}

/** Descarta a sugestao sem categorizar. */
export async function dismissSuggestionAction(
  _prevState: ReconcileState,
  formData: FormData,
): Promise<ReconcileState> {
  const context = await getWorkspaceOrThrow();

  const companyId = parseId(formData, "companyId");
  if (!companyId.success) return { error: firstIssue(companyId.error) };
  const company = await assertCompanyInWorkspace(companyId.data, context);

  const transactionId = parseId(formData, "transactionId");
  if (!transactionId.success) return { error: firstIssue(transactionId.error) };

  await assertTransactionsInWorkspace([transactionId.data], context);

  await prisma.transaction.update({
    where: { id: transactionId.data },
    data: { aiSuggestedCategoryId: null, aiConfidence: null },
  });

  revalidateCompany(company.id);
  return { success: "Sugestão descartada." };
}

// ---------------------------------------------------------------------------
// Transferencias (Secao 5.4)
// ---------------------------------------------------------------------------

/**
 * Vincula as duas pontas de uma transferencia e marca as duas com a categoria
 * neutra, para que fiquem fora da DRE e dos totais.
 */
export async function linkTransferAction(
  _prevState: ReconcileState,
  formData: FormData,
): Promise<ReconcileState> {
  const context = await getWorkspaceOrThrow();

  const companyId = parseId(formData, "companyId");
  if (!companyId.success) return { error: firstIssue(companyId.error) };
  const company = await assertCompanyInWorkspace(companyId.data, context);

  const outgoingId = parseId(formData, "outgoingId");
  const incomingId = parseId(formData, "incomingId");
  if (!outgoingId.success || !incomingId.success) {
    return { error: "Lançamentos inválidos." };
  }

  await assertTransactionsInWorkspace(
    [outgoingId.data, incomingId.data],
    context,
  );

  const categories = await getWorkspaceCategories(context);
  const transfer = findTransferCategory(categories);

  if (!transfer) {
    return {
      error:
        "Não há categoria de transferência no plano de contas deste escritório.",
    };
  }

  await prisma.$transaction([
    prisma.transaction.update({
      where: { id: outgoingId.data },
      data: {
        categoryId: transfer.id,
        categorizedBy: "MANUAL",
        transferPairId: incomingId.data,
      },
    }),
    prisma.transaction.update({
      where: { id: incomingId.data },
      data: { categoryId: transfer.id, categorizedBy: "MANUAL" },
    }),
  ]);

  revalidateCompany(company.id);
  return { success: "Transferência vinculada." };
}

/** Desfaz o vinculo, devolvendo os dois lados para sem categoria. */
export async function unlinkTransferAction(
  _prevState: ReconcileState,
  formData: FormData,
): Promise<ReconcileState> {
  const context = await getWorkspaceOrThrow();

  const companyId = parseId(formData, "companyId");
  if (!companyId.success) return { error: firstIssue(companyId.error) };
  const company = await assertCompanyInWorkspace(companyId.data, context);

  const transactionId = parseId(formData, "transactionId");
  if (!transactionId.success) return { error: firstIssue(transactionId.error) };

  await assertTransactionsInWorkspace([transactionId.data], context);

  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId.data },
  });
  if (!transaction) return { error: "Lançamento não encontrado." };

  const pairId = transaction.transferPairId;

  await prisma.$transaction([
    prisma.transaction.update({
      where: { id: transaction.id },
      data: { categoryId: null, categorizedBy: "NONE", transferPairId: null },
    }),
    ...(pairId
      ? [
          prisma.transaction.update({
            where: { id: pairId },
            data: { categoryId: null, categorizedBy: "NONE" },
          }),
        ]
      : []),
  ]);

  revalidateCompany(company.id);
  return { success: "Vínculo desfeito." };
}

/** Sugestoes de transferencia do periodo, para a tela de conciliacao. */
export async function findTransferSuggestions(
  companyId: string,
  month: { year: number; month: number },
) {
  const transactions = await prisma.transaction.findMany({
    where: {
      account: { companyId },
      date: { gte: monthStart(month), lt: monthEnd(month) },
      transferPairId: null,
      categoryId: null,
    },
    select: {
      id: true,
      accountId: true,
      date: true,
      amountCents: true,
      description: true,
      account: { select: { nickname: true } },
    },
  });

  return detectTransferPairs(transactions).map((pair) => ({
    ...pair,
    outgoingAccount: transactions.find((t) => t.id === pair.outgoing.id)?.account
      .nickname,
    incomingAccount: transactions.find((t) => t.id === pair.incoming.id)?.account
      .nickname,
  }));
}
