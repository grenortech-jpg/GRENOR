import type { Metadata } from "next";
import { Building2 } from "lucide-react";

import { FirstStepsChecklist } from "@/components/app/first-steps";
import { CompanyCard } from "@/components/companies/company-card";
import { CompanySearch } from "@/components/companies/company-search";
import { NewCompanyDialog } from "@/components/companies/new-company-dialog";
import { getWorkspaceOrThrow } from "@/lib/auth/workspace";
import { getFirstSteps } from "@/lib/companies/first-steps";
import { listCompanyOverviews } from "@/lib/companies/overview";
import { formatMonth } from "@/lib/format";
import { currentMonth } from "@/lib/period";

export const metadata: Metadata = { title: "Empresas" };

export default async function DashboardPage({ searchParams }: PageProps<"/app">) {
  const context = await getWorkspaceOrThrow();

  const params = await searchParams;
  const search = typeof params.busca === "string" ? params.busca : "";

  const month = currentMonth();
  const [companies, firstSteps] = await Promise.all([
    listCompanyOverviews(context, { search, month }),
    getFirstSteps(context),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Empresas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {context.workspace.name} · situação de {formatMonth(month.year, month.month)}
          </p>
        </div>

        <NewCompanyDialog />
      </div>

      <FirstStepsChecklist steps={firstSteps} />

      <CompanySearch initialValue={search} />

      {companies.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => (
            <CompanyCard key={company.id} company={company} />
          ))}
        </div>
      ) : search ? (
        <EmptyState
          title="Nenhuma empresa encontrada"
          description={`Nada corresponde a "${search}". Tente outro nome ou CNPJ.`}
        />
      ) : (
        <EmptyState
          title="Nenhuma empresa cadastrada"
          description="Cadastre a primeira empresa cliente para começar a importar extratos."
          action={<NewCompanyDialog label="Cadastrar primeira empresa" />}
        />
      )}
    </div>
  );
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed px-6 py-16 text-center">
      <Building2 className="size-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="mt-4 font-medium">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
