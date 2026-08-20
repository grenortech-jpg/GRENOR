import "server-only";

import { cache } from "react";

import type { Category } from "@/generated/prisma/client";
import type { WorkspaceContext } from "@/lib/auth/workspace";
import {
  CATEGORY_GROUP_LABELS,
  CATEGORY_GROUP_ORDER,
} from "@/lib/categories/default-plan";
import { prisma } from "@/lib/prisma";

/**
 * Plano de contas do workspace, na ordem de apresentacao da DRE.
 *
 * Em cache por render: a tela de conciliacao precisa da lista no seletor de
 * cada linha, no filtro e no dialogo de regra.
 */
export const getWorkspaceCategories = cache(
  async (context: WorkspaceContext): Promise<Category[]> => {
    const categories = await prisma.category.findMany({
      where: { workspaceId: context.workspace.id },
    });

    const groupPosition = new Map(
      CATEGORY_GROUP_ORDER.map((group, index) => [group, index]),
    );

    return categories.sort((a, b) => {
      const groupDiff =
        (groupPosition.get(a.group) ?? 99) - (groupPosition.get(b.group) ?? 99);
      if (groupDiff !== 0) return groupDiff;
      return a.sortOrder - b.sortOrder;
    });
  },
);

export type CategoryOption = {
  id: string;
  name: string;
  group: string;
  groupLabel: string;
  isTransferNeutral: boolean;
};

/** Formato enxuto para os seletores da interface. */
export function toOptions(categories: Category[]): CategoryOption[] {
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    group: category.group,
    groupLabel: CATEGORY_GROUP_LABELS[category.group],
    isTransferNeutral: category.isTransferNeutral,
  }));
}

/** A categoria neutra de transferencia do workspace, se existir. */
export function findTransferCategory(categories: Category[]): Category | null {
  return categories.find((category) => category.isTransferNeutral) ?? null;
}
