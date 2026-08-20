"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import {
  assertCanAdminister,
  assertAccountInWorkspace,
  assertCompanyInWorkspace,
  getCurrentWorkspace,
  getWorkspaceOrThrow,
} from "@/lib/auth/workspace";
import { prisma } from "@/lib/prisma";
import {
  field,
  firstIssue,
  parseBankAccount,
  parseCompany,
  parseId,
  parseWorkspace,
} from "@/lib/validation/schemas";
import { createWorkspaceForUser } from "@/lib/workspace/create";

export type FormState = {
  error?: string;
  success?: string;
};

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

/** Passo 1 do onboarding. Idempotente: quem ja tem workspace so segue adiante. */
export async function createWorkspaceAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const existing = await getCurrentWorkspace();
  if (existing) redirect("/onboarding?passo=empresa");

  const parsed = parseWorkspace(formData);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  await createWorkspaceForUser({ userId: user.id, name: parsed.data.name });

  redirect("/onboarding?passo=empresa");
}

export async function updateWorkspaceAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getWorkspaceOrThrow();
  assertCanAdminister(context);

  const parsed = parseWorkspace(formData);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  await prisma.workspace.update({
    where: { id: context.workspace.id },
    data: { name: parsed.data.name },
  });

  revalidatePath("/configuracoes");
  revalidatePath("/app");

  return { success: "Dados do escritório atualizados." };
}

// ---------------------------------------------------------------------------
// Empresas
// ---------------------------------------------------------------------------

export async function createCompanyAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getWorkspaceOrThrow();

  const parsed = parseCompany(formData);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const company = await prisma.company.create({
    data: {
      workspaceId: context.workspace.id,
      name: parsed.data.name,
      cnpj: parsed.data.cnpj ?? null,
      segment: parsed.data.segment ?? null,
    },
  });

  revalidatePath("/app");

  const next = field(formData, "next");
  if (next === "onboarding") {
    redirect(`/onboarding?passo=conta&empresa=${company.id}`);
  }

  redirect(`/empresas/${company.id}`);
}

export async function updateCompanyAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getWorkspaceOrThrow();

  const id = parseId(formData, "companyId");
  if (!id.success) return { error: firstIssue(id.error) };

  // Barreira da Secao 3: o id veio do cliente e precisa ser do workspace.
  const company = await assertCompanyInWorkspace(id.data, context);

  const parsed = parseCompany(formData);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  await prisma.company.update({
    where: { id: company.id },
    data: {
      name: parsed.data.name,
      cnpj: parsed.data.cnpj ?? null,
      segment: parsed.data.segment ?? null,
    },
  });

  revalidatePath("/app");
  revalidatePath(`/empresas/${company.id}`);

  return { success: "Empresa atualizada." };
}

/**
 * Exclusao em cascata: contas, transacoes, lotes, periodos e relatorios da
 * empresa somem junto (LGPD, Secao 2).
 */
export async function deleteCompanyAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getWorkspaceOrThrow();
  assertCanAdminister(context);

  const id = parseId(formData, "companyId");
  if (!id.success) return { error: firstIssue(id.error) };

  const company = await assertCompanyInWorkspace(id.data, context);

  const confirmation = field(formData, "confirmation")?.trim();
  if (confirmation !== company.name) {
    return { error: "Digite o nome exato da empresa para confirmar." };
  }

  await prisma.company.delete({ where: { id: company.id } });

  revalidatePath("/app");
  redirect("/app");
}

// ---------------------------------------------------------------------------
// Contas bancarias
// ---------------------------------------------------------------------------

export async function createAccountAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getWorkspaceOrThrow();

  const companyId = parseId(formData, "companyId");
  if (!companyId.success) return { error: firstIssue(companyId.error) };

  const company = await assertCompanyInWorkspace(companyId.data, context);

  const parsed = parseBankAccount(formData);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  await prisma.bankAccount.create({
    data: {
      companyId: company.id,
      bankName: parsed.data.bankName,
      nickname: parsed.data.nickname,
      openingBalanceCents: parsed.data.openingBalanceCents,
      openingBalanceDate: parsed.data.openingBalanceDate,
    },
  });

  revalidatePath(`/empresas/${company.id}`);

  const next = field(formData, "next");
  if (next === "onboarding") redirect("/onboarding?passo=pronto");

  return { success: "Conta cadastrada." };
}

export async function updateAccountAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getWorkspaceOrThrow();

  const id = parseId(formData, "accountId");
  if (!id.success) return { error: firstIssue(id.error) };

  const account = await assertAccountInWorkspace(id.data, context);

  const parsed = parseBankAccount(formData);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  await prisma.bankAccount.update({
    where: { id: account.id },
    data: {
      bankName: parsed.data.bankName,
      nickname: parsed.data.nickname,
      openingBalanceCents: parsed.data.openingBalanceCents,
      openingBalanceDate: parsed.data.openingBalanceDate,
    },
  });

  revalidatePath(`/empresas/${account.companyId}`);

  return { success: "Conta atualizada." };
}

export async function deleteAccountAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getWorkspaceOrThrow();
  assertCanAdminister(context);

  const id = parseId(formData, "accountId");
  if (!id.success) return { error: firstIssue(id.error) };

  const account = await assertAccountInWorkspace(id.data, context);

  const transactions = await prisma.transaction.count({
    where: { accountId: account.id },
  });

  if (transactions > 0) {
    return {
      error: `Esta conta tem ${transactions} lançamento(s) importado(s). Exclua a empresa se quiser remover tudo.`,
    };
  }

  await prisma.bankAccount.delete({ where: { id: account.id } });

  revalidatePath(`/empresas/${account.companyId}`);

  return { success: "Conta removida." };
}
