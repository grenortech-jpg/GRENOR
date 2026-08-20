"use client";

import { ArrowLeftRight } from "lucide-react";
import { useActionState } from "react";

import {
  linkTransferAction,
  type ReconcileState,
} from "@/app/(app)/empresas/[id]/conciliacao/actions";
import { FormFeedback } from "@/components/forms/form-feedback";
import { SubmitButton } from "@/components/forms/submit-button";

export type TransferSuggestion = {
  outgoingId: string;
  incomingId: string;
  amount: string;
  outgoingDate: string;
  incomingDate: string;
  outgoingAccount: string;
  incomingAccount: string;
  outgoingDescription: string;
  incomingDescription: string;
};

const initialState: ReconcileState = {};

/**
 * Pares candidatos a transferencia (Secao 5.4).
 *
 * Sao apenas sugestoes: o vinculo so acontece quando o usuario confirma. Um par
 * de mesmo valor e sinais opostos pode ser coincidencia - pagamento a um
 * fornecedor e recebimento de um cliente pelo mesmo valor na mesma semana
 * acontece.
 */
export function TransferSuggestions({
  companyId,
  suggestions,
}: {
  companyId: string;
  suggestions: TransferSuggestion[];
}) {
  const [state, formAction] = useActionState(linkTransferAction, initialState);

  if (suggestions.length === 0) return null;

  return (
    <div className="rounded-lg border border-brand/30 bg-accent/30 p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <ArrowLeftRight className="size-4 text-brand" aria-hidden="true" />
        {suggestions.length} possível(is) transferência(s) entre contas
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Transferência entra e sai da mesma empresa. Vinculada, fica fora da DRE e
        dos totais, para não inflar receita e despesa do mês.
      </p>

      <FormFeedback state={state} />

      <ul className="mt-3 space-y-2">
        {suggestions.map((suggestion) => (
          <li
            key={`${suggestion.outgoingId}-${suggestion.incomingId}`}
            className="flex flex-wrap items-center gap-3 rounded-md border bg-background px-3 py-2 text-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate">
                <span className="text-negative tabular">−{suggestion.amount}</span>{" "}
                {suggestion.outgoingDescription}
                <span className="text-xs text-muted-foreground">
                  {" "}
                  · {suggestion.outgoingAccount} · {suggestion.outgoingDate}
                </span>
              </p>
              <p className="truncate">
                <span className="text-positive tabular">+{suggestion.amount}</span>{" "}
                {suggestion.incomingDescription}
                <span className="text-xs text-muted-foreground">
                  {" "}
                  · {suggestion.incomingAccount} · {suggestion.incomingDate}
                </span>
              </p>
            </div>

            <form action={formAction}>
              <input type="hidden" name="companyId" value={companyId} />
              <input type="hidden" name="outgoingId" value={suggestion.outgoingId} />
              <input type="hidden" name="incomingId" value={suggestion.incomingId} />
              <SubmitButton size="sm" variant="outline" pendingLabel="Vinculando…">
                É transferência
              </SubmitButton>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
