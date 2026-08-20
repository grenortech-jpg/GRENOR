import { Landmark } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatCnpj } from "@/lib/format";
import {
  STATUS_LABELS,
  type CompanyMonthStatus,
  type CompanyOverview,
} from "@/lib/companies/overview";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<CompanyMonthStatus, string> = {
  NO_DATA: "bg-muted text-muted-foreground",
  RECONCILING: "bg-gold/15 text-gold-foreground",
  CLOSED: "bg-positive/10 text-positive",
};

export function CompanyStatusBadge({ status }: { status: CompanyMonthStatus }) {
  return (
    <Badge
      variant="secondary"
      className={cn("shrink-0 font-medium", STATUS_STYLES[status])}
    >
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function CompanyCard({ company }: { company: CompanyOverview }) {
  return (
    <Link
      href={`/empresas/${company.id}`}
      className="group flex flex-col justify-between rounded-lg border bg-card p-5 transition-colors hover:border-brand/40 hover:bg-accent/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-medium group-hover:text-brand">
            {company.name}
          </h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {company.cnpj ? formatCnpj(company.cnpj) : "CNPJ não informado"}
            {company.segment ? ` · ${company.segment}` : ""}
          </p>
        </div>

        <CompanyStatusBadge status={company.status} />
      </div>

      <dl className="mt-5 flex items-center gap-5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Landmark className="size-3.5" aria-hidden="true" />
          <dt className="sr-only">Contas bancárias</dt>
          <dd>
            {company.accountsCount === 0
              ? "sem conta"
              : `${company.accountsCount} conta${company.accountsCount > 1 ? "s" : ""}`}
          </dd>
        </div>

        {company.transactionsInMonth > 0 && (
          <div>
            <dt className="sr-only">Lançamentos no mês</dt>
            <dd>
              {company.transactionsInMonth} lançamento
              {company.transactionsInMonth > 1 ? "s" : ""}
            </dd>
          </div>
        )}

        {company.uncategorizedInMonth > 0 && (
          <div className="text-gold">
            <dt className="sr-only">Sem categoria</dt>
            <dd>{company.uncategorizedInMonth} sem categoria</dd>
          </div>
        )}
      </dl>
    </Link>
  );
}
