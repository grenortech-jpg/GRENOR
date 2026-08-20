import type { Metadata } from "next";
import { CheckCircle2, CircleAlert, Database } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { displayName, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Painel" };

type DatabaseStatus =
  | { ok: true; categories: number; workspaces: number }
  | { ok: false; message: string };

async function checkDatabase(): Promise<DatabaseStatus> {
  try {
    const [categories, workspaces] = await Promise.all([
      prisma.category.count({ where: { workspaceId: null } }),
      prisma.workspace.count(),
    ]);
    return { ok: true, categories, workspaces };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Erro desconhecido.",
    };
  }
}

export default async function DashboardPage() {
  const user = await requireUser();
  const status = await checkDatabase();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Olá, {displayName(user).split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A fundação do Grenor está no ar. O painel de empresas chega na Fase 1.
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center gap-3 space-y-0">
          <Database className="size-5 text-muted-foreground" aria-hidden="true" />
          <div className="flex-1">
            <CardTitle className="text-base">Estado da fundação</CardTitle>
            <CardDescription>
              Verificação de conexão com o banco e do plano de contas padrão.
            </CardDescription>
          </div>
          {status.ok ? (
            <Badge className="bg-positive/10 text-positive hover:bg-positive/10">
              Conectado
            </Badge>
          ) : (
            <Badge variant="destructive">Sem conexão</Badge>
          )}
        </CardHeader>

        <CardContent>
          {status.ok ? (
            <ul className="space-y-2 text-sm">
              <StatusLine ok>
                Banco de dados respondendo pelo Prisma.
              </StatusLine>
              <StatusLine ok={status.categories > 0}>
                {status.categories > 0
                  ? `Plano de contas padrão com ${status.categories} categorias.`
                  : "Plano de contas padrão ainda não semeado (rode npm run db:seed)."}
              </StatusLine>
              <StatusLine ok>
                {status.workspaces === 0
                  ? "Nenhum workspace criado ainda."
                  : `${status.workspaces} workspace(s) cadastrado(s).`}
              </StatusLine>
            </ul>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                Não foi possível consultar o banco. Confira DATABASE_URL e se as
                migrações foram aplicadas.
              </p>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
                {status.message}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusLine({
  ok,
  children,
}: {
  ok: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-2">
      {ok ? (
        <CheckCircle2
          className="mt-0.5 size-4 shrink-0 text-positive"
          aria-hidden="true"
        />
      ) : (
        <CircleAlert
          className="mt-0.5 size-4 shrink-0 text-gold"
          aria-hidden="true"
        />
      )}
      <span>{children}</span>
    </li>
  );
}
