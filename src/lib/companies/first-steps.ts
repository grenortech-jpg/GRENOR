import "server-only";

import type { WorkspaceContext } from "@/lib/auth/workspace";
import { prisma } from "@/lib/prisma";

/**
 * Checklist de primeiros passos do painel (Fase 12).
 *
 * Calculado do estado real, nunca de flags: se o escritorio ja fechou um mes
 * e gerou relatorio, nao ha o que ensinar e o checklist some.
 */
export type FirstSteps = {
  company: boolean;
  account: boolean;
  imported: boolean;
  categorized: boolean;
  closed: boolean;
  delivered: boolean;
  complete: boolean;
};

export async function getFirstSteps(context: WorkspaceContext): Promise<FirstSteps> {
  const workspaceId = context.workspace.id;

  const [companies, accounts, transactions, categorized, closed, delivered] =
    await Promise.all([
      prisma.company.count({ where: { workspaceId } }),
      prisma.bankAccount.count({ where: { company: { workspaceId } } }),
      prisma.transaction.count({ where: { account: { company: { workspaceId } } } }),
      prisma.transaction.count({
        where: { account: { company: { workspaceId } }, categoryId: { not: null } },
      }),
      prisma.period.count({ where: { company: { workspaceId }, status: "CLOSED" } }),
      prisma.report.count({
        where: {
          period: { company: { workspaceId } },
          OR: [{ pdfUrl: { not: null } }, { shareEnabled: true }],
        },
      }),
    ]);

  const steps = {
    company: companies > 0,
    account: accounts > 0,
    imported: transactions > 0,
    categorized: categorized > 0,
    closed: closed > 0,
    delivered: delivered > 0,
  };

  return { ...steps, complete: Object.values(steps).every(Boolean) };
}
