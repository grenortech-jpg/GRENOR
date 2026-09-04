import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Landmark } from "lucide-react";

import { ImportFlow, type AccountOption } from "@/components/import/import-flow";
import { buttonVariants } from "@/components/ui/button";
import { assertCompanyInWorkspace, getWorkspaceOrThrow } from "@/lib/auth/workspace";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Importar extrato" };

export default async function ImportPage({
  params,
}: PageProps<"/empresas/[id]/importar">) {
  const context = await getWorkspaceOrThrow();
  const { id } = await params;

  const company = await assertCompanyInWorkspace(id, context);

  const [accounts, batches] = await Promise.all([
    prisma.bankAccount.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.importBatch.findMany({
      where: { account: { companyId: company.id }, status: "CONFIRMED" },
      orderBy: { confirmedAt: "desc" },
      take: 10,
      include: { account: { select: { nickname: true } } },
    }),
  ]);

  const options: AccountOption[] = accounts.map((account) => ({
    id: account.id,
    label: `${account.nickname} · ${account.bankName}`,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Link
          href={`/empresas/${company.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {company.name}
        </Link>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Importar extrato
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          OFX, CSV ou XLSX. O Finort identifica o formato, o separador e as
          colunas sozinho.
        </p>
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-lg border border-dashed px-6 py-12 text-center">
          <Landmark
            className="mx-auto size-8 text-muted-foreground"
            aria-hidden="true"
          />
          <h2 className="mt-4 font-medium">Nenhuma conta bancária</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre uma conta com saldo inicial antes de importar extratos.
          </p>
          <Link
            href={`/empresas/${company.id}`}
            className={`${buttonVariants({ variant: "outline" })} mt-6`}
          >
            Cadastrar conta
          </Link>
        </div>
      ) : (
        <ImportFlow accounts={options} />
      )}

      {batches.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-medium">Importações anteriores</h2>
          <ul className="divide-y rounded-lg border text-sm">
            {batches.map((batch) => (
              <li
                key={batch.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{batch.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {batch.account.nickname} ·{" "}
                    {batch.confirmedAt ? formatDate(batch.confirmedAt) : "—"}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground tabular">
                  {batch.rowsImported} importado(s)
                  {batch.rowsDuplicated > 0 &&
                    ` · ${batch.rowsDuplicated} duplicado(s)`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
