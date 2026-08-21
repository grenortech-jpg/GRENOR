"use client";

import { Sparkles } from "lucide-react";
import { useActionState } from "react";

import {
  generateSummaryAction,
  saveSummaryAction,
  type ClosingState,
} from "@/app/(app)/empresas/[id]/fechamento/actions";
import { FormFeedback } from "@/components/forms/form-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Textarea } from "@/components/ui/textarea";

const initialState: ClosingState = {};

export type SummaryPanelProps = {
  companyId: string;
  monthKey: string;
  periodId: string | null;
  summary: string | null;
  generationsUsed: number;
  maxGenerations: number;
  aiEnabled: boolean;
  closed: boolean;
};

/**
 * Parecer executivo do relatorio (Secoes 7 e 8.2).
 *
 * O campo de texto e o caminho principal, nao o plano B: com AI_ENABLED
 * desligado ele e a unica forma de escrever o parecer (Secao 8.3), e com a IA
 * ligada ele continua sendo onde o texto e revisado antes de virar PDF - o
 * relatorio sai assinado pelo escritorio.
 */
export function SummaryPanel({
  companyId,
  monthKey,
  periodId,
  summary,
  generationsUsed,
  maxGenerations,
  aiEnabled,
  closed,
}: SummaryPanelProps) {
  const [generateState, generate] = useActionState(
    generateSummaryAction,
    initialState,
  );
  const [saveState, save] = useActionState(saveSummaryAction, initialState);

  const left = Math.max(0, maxGenerations - generationsUsed);

  return (
    <section className="rounded-lg border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">Parecer executivo</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Abre o relatório, logo depois da capa. Três a cinco parágrafos.
          </p>
        </div>

        {aiEnabled && closed && (
          <form action={generate}>
            <input type="hidden" name="companyId" value={companyId} />
            <input type="hidden" name="mes" value={monthKey} />
            <SubmitButton
              size="sm"
              variant="outline"
              disabled={left === 0}
              pendingLabel="Escrevendo…"
            >
              <Sparkles className="size-4" aria-hidden="true" />
              {generationsUsed === 0 ? "Gerar com IA" : "Gerar de novo"}
              <span className="text-xs opacity-75">({left})</span>
            </SubmitButton>
          </form>
        )}
      </div>

      {!closed ? (
        <p className="mt-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          Feche o período para escrever o parecer. Ele descreve os números
          congelados no fechamento.
        </p>
      ) : (
        <form action={save} className="mt-4 space-y-3">
          <input type="hidden" name="companyId" value={companyId} />
          <input type="hidden" name="periodId" value={periodId ?? ""} />

          <Textarea
            // A key remonta o campo quando o texto do servidor muda, que e o
            // que acontece depois de uma geracao por IA. Sem isso o campo
            // continuaria exibindo o texto antigo com o banco ja atualizado.
            key={summary ?? ""}
            name="parecer"
            rows={10}
            defaultValue={summary ?? ""}
            placeholder={
              aiEnabled
                ? "Gere com IA e revise aqui, ou escreva do zero."
                : "Escreva o parecer que abre o relatório."
            }
            aria-label="Parecer executivo"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {aiEnabled
                ? `${left} de ${maxGenerations} gerações por IA restantes neste período. A edição manual é ilimitada.`
                : "IA desligada: o parecer é escrito à mão."}
            </p>

            <SubmitButton size="sm" pendingLabel="Salvando…">
              Salvar parecer
            </SubmitButton>
          </div>

          <FormFeedback state={saveState} />
        </form>
      )}

      <div className="mt-3">
        <FormFeedback state={generateState} />
      </div>
    </section>
  );
}
