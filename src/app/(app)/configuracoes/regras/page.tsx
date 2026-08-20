import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { RulesManager, type RuleView } from "@/components/rules/rules-manager";
import { getWorkspaceOrThrow } from "@/lib/auth/workspace";
import { getWorkspaceCategories, toOptions } from "@/lib/categories/list";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Regras de categorização" };

export default async function RulesPage() {
  const context = await getWorkspaceOrThrow();

  const [rules, categories] = await Promise.all([
    prisma.categoryRule.findMany({
      where: { workspaceId: context.workspace.id },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      include: { category: { select: { name: true } } },
    }),
    getWorkspaceCategories(context),
  ]);

  const views: RuleView[] = rules.map((rule) => ({
    id: rule.id,
    matchType: rule.matchType,
    pattern: rule.pattern,
    priority: rule.priority,
    active: rule.active,
    categoryId: rule.categoryId,
    categoryName: rule.category.name,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/configuracoes"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Configurações
        </Link>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Regras de categorização
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {rules.length} regra(s). Elas valem para todas as empresas do escritório
          e rodam antes da IA — o que a regra resolve não custa nada. Menor
          prioridade decide primeiro; em empate, o padrão mais específico ganha.
        </p>
      </div>

      <RulesManager rules={views} categories={toOptions(categories)} />
    </div>
  );
}
