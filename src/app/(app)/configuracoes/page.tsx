import type { Metadata } from "next";
import Link from "next/link";

import { WorkspaceForm } from "@/components/workspace/workspace-form";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { canAdminister, getWorkspaceOrThrow } from "@/lib/auth/workspace";
import {
  CATEGORY_GROUP_LABELS,
  CATEGORY_GROUP_ORDER,
} from "@/lib/categories/default-plan";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Configurações" };

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Proprietário",
  ADMIN: "Administrador",
  MEMBER: "Membro",
};

export default async function SettingsPage() {
  const context = await getWorkspaceOrThrow();
  const user = await getCurrentUser();

  const [members, categories, companiesCount, rulesCount] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId: context.workspace.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.category.findMany({
      where: { workspaceId: context.workspace.id },
      orderBy: [{ sortOrder: "asc" }],
    }),
    prisma.company.count({ where: { workspaceId: context.workspace.id } }),
    prisma.categoryRule.count({ where: { workspaceId: context.workspace.id } }),
  ]);

  const byGroup = CATEGORY_GROUP_ORDER.map((group) => ({
    group,
    label: CATEGORY_GROUP_LABELS[group],
    items: categories.filter((category) => category.group === group),
  })).filter((entry) => entry.items.length > 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {context.workspace.name} · {companiesCount} empresa(s)
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do escritório</CardTitle>
          <CardDescription>
            Identificador na URL: <code className="font-mono">{context.workspace.slug}</code>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canAdminister(context.role) ? (
            <WorkspaceForm mode="edit" defaultName={context.workspace.name} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Apenas administradores podem alterar os dados do escritório.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Membros</CardTitle>
          <CardDescription>
            Quem tem acesso às empresas deste escritório. Convite de novos
            membros chega em uma fase posterior.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {members.map((member) => (
              <li
                key={member.id}
                className="flex items-center justify-between py-2.5 text-sm"
              >
                <span>
                  {member.userId === user?.id ? (
                    <>
                      {user?.email}{" "}
                      <span className="text-muted-foreground">(você)</span>
                    </>
                  ) : (
                    <span className="font-mono text-xs text-muted-foreground">
                      {member.userId}
                    </span>
                  )}
                </span>
                <Badge variant="secondary">
                  {ROLE_LABELS[member.role] ?? member.role}
                </Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Regras de categorização</CardTitle>
          <CardDescription>
            {rulesCount === 0
              ? "Nenhuma regra ainda. Elas nascem na conciliação, ao corrigir a categoria de um lançamento."
              : `${rulesCount} regra(s) ativas para todas as empresas do escritório.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/configuracoes/regras"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Gerenciar regras
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plano de contas gerencial</CardTitle>
          <CardDescription>
            {categories.length} categorias, na ordem em que aparecem na DRE de
            caixa. A edição chega junto com a tela de conciliação.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {byGroup.map((entry) => (
            <div key={entry.group}>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {entry.label}
              </h3>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {entry.items.map((category) => (
                  <li
                    key={category.id}
                    className="rounded-md bg-muted px-2 py-1 text-xs"
                  >
                    {category.name}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
