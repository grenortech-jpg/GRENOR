import "server-only";

import { notFound, redirect } from "next/navigation";

import type { BankAccount, Company, Period, Workspace } from "@/generated/prisma/client";
import type { MemberRole } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/**
 * Camada 1 da Secao 3 do CLAUDE.md.
 *
 * O Prisma conecta como dono das tabelas e por isso NAO passa por RLS. Todo
 * acesso a dado de tenant precisa comecar por getWorkspaceOrThrow() e, quando
 * o recurso vem de um id da URL ou de um formulario, passar por um dos
 * assert*InWorkspace(). Nenhuma rota consulta o Prisma sem isso.
 *
 * Recurso de outro workspace responde 404, nunca 403: um 403 confirmaria que
 * o id existe.
 */

export type WorkspaceContext = {
  userId: string;
  workspace: Workspace;
  role: MemberRole;
};

/** Contexto do workspace do usuario, ou null se ele ainda nao tem nenhum. */
export async function getCurrentWorkspace(): Promise<WorkspaceContext | null> {
  const user = await requireUser();

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });

  if (!membership) return null;

  return {
    userId: user.id,
    workspace: membership.workspace,
    role: membership.role,
  };
}

/**
 * Contexto obrigatorio. Sem workspace, manda para o onboarding: e o unico
 * caminho valido para quem acabou de criar a conta.
 */
export async function getWorkspaceOrThrow(): Promise<WorkspaceContext> {
  const context = await getCurrentWorkspace();
  if (!context) redirect("/onboarding");
  return context;
}

/** Papeis que podem administrar o workspace (membros, dados, exclusoes). */
export function canAdminister(role: MemberRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/** Exige papel administrativo. */
export function assertCanAdminister(context: WorkspaceContext): void {
  if (!canAdminister(context.role)) notFound();
}

export async function assertCompanyInWorkspace(
  companyId: string,
  context: WorkspaceContext,
): Promise<Company> {
  const company = await prisma.company.findFirst({
    where: { id: companyId, workspaceId: context.workspace.id },
  });

  if (!company) notFound();
  return company;
}

export type AccountWithCompany = BankAccount & { company: Company };

export async function assertAccountInWorkspace(
  accountId: string,
  context: WorkspaceContext,
): Promise<AccountWithCompany> {
  const account = await prisma.bankAccount.findFirst({
    where: { id: accountId, company: { workspaceId: context.workspace.id } },
    include: { company: true },
  });

  if (!account) notFound();
  return account;
}

export type PeriodWithCompany = Period & { company: Company };

export async function assertPeriodInWorkspace(
  periodId: string,
  context: WorkspaceContext,
): Promise<PeriodWithCompany> {
  const period = await prisma.period.findFirst({
    where: { id: periodId, company: { workspaceId: context.workspace.id } },
    include: { company: true },
  });

  if (!period) notFound();
  return period;
}

/** Garante que uma categoria pertence ao workspace (ou e do sistema). */
export async function assertCategoryInWorkspace(
  categoryId: string,
  context: WorkspaceContext,
) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, workspaceId: context.workspace.id },
  });

  if (!category) notFound();
  return category;
}
