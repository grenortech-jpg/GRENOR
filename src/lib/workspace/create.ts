import "server-only";

import { DEFAULT_CATEGORIES } from "@/lib/categories/default-plan";
import { prisma } from "@/lib/prisma";
import { uniqueSlug } from "@/lib/workspace/slug";

/**
 * Cria o workspace, vincula o usuario como OWNER e clona o plano de contas
 * padrao (Secao 6) para dentro dele.
 *
 * O clone e proposital: o escritorio precisa poder renomear e acrescentar
 * categorias sem afetar os demais workspaces.
 */
export async function createWorkspaceForUser(params: {
  userId: string;
  name: string;
}) {
  const existing = await prisma.workspace.findMany({ select: { slug: true } });
  const slug = uniqueSlug(
    params.name,
    new Set(existing.map((workspace) => workspace.slug)),
  );

  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: { name: params.name, slug },
    });

    await tx.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: params.userId,
        role: "OWNER",
      },
    });

    await tx.category.createMany({
      data: DEFAULT_CATEGORIES.map((category) => ({
        workspaceId: workspace.id,
        name: category.name,
        group: category.group,
        sortOrder: category.sortOrder,
        isTransferNeutral: category.isTransferNeutral ?? false,
        // Vinculo com a categoria do sistema: e o que permite a sugestao
        // global por CNPJ/CNAE apontar para a categoria certa (Fase 11).
        defaultId: category.id,
      })),
    });

    return workspace;
  });
}
