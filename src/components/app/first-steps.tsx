import { CheckCircle2, Circle } from "lucide-react";

import { DemoCompanyButton } from "@/components/companies/demo-company-button";
import type { FirstSteps } from "@/lib/companies/first-steps";
import { cn } from "@/lib/utils";

const STEPS: { key: keyof Omit<FirstSteps, "complete">; label: string; hint: string }[] = [
  { key: "company", label: "Cadastrar uma empresa", hint: "O cliente do escritório: nome e, se quiser, CNPJ." },
  { key: "account", label: "Cadastrar a conta bancária", hint: "Com saldo inicial e data, para o saldo consolidado fechar." },
  { key: "imported", label: "Importar o primeiro extrato", hint: "OFX, CSV ou XLSX. Reimportar nunca duplica." },
  { key: "categorized", label: "Categorizar os lançamentos", hint: "Memória, CNPJ e regras primeiro; o que sobra você revisa." },
  { key: "closed", label: "Fechar o mês", hint: "Só com 100% categorizado. Os números congelam." },
  { key: "delivered", label: "Entregar o relatório", hint: "PDF ou link compartilhável para o cliente." },
];

/** Some quando tudo esta feito: nao ha o que ensinar a quem ja entregou relatorio. */
export function FirstStepsChecklist({ steps }: { steps: FirstSteps }) {
  if (steps.complete) return null;

  const done = STEPS.filter((step) => steps[step.key]).length;

  return (
    <section className="rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-medium">Primeiros passos</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {done} de {STEPS.length} concluídos. Quer ver o produto pronto antes?
            Crie a empresa de demonstração: três meses de uma padaria fictícia,
            já categorizados.
          </p>
        </div>
        <DemoCompanyButton />
      </div>

      <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {STEPS.map((step) => {
          const ok = steps[step.key];
          return (
            <li key={step.key} className="flex items-start gap-2 text-sm">
              {ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-positive" aria-hidden="true" />
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <span>
                <span className={cn("font-medium", ok && "text-muted-foreground line-through")}>
                  {step.label}
                </span>
                {!ok && <span className="block text-xs text-muted-foreground">{step.hint}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
