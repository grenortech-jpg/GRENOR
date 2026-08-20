"use client";

import { Sparkles } from "lucide-react";
import { useActionState } from "react";

import {
  categorizeWithAiAction,
  type ReconcileState,
} from "@/app/(app)/empresas/[id]/conciliacao/actions";
import { FormFeedback } from "@/components/forms/form-feedback";
import { SubmitButton } from "@/components/forms/submit-button";

const initialState: ReconcileState = {};

/**
 * Camada 2 da categorizacao (Secao 5.3).
 *
 * So aparece quando a IA esta ligada: sem AI_ENABLED o botao nao existe, em vez
 * de existir e falhar - a aplicacao funciona 100% sem IA (Secao 8.3).
 */
export function AiCategorizeButton({
  companyId,
  monthKey,
  pendingCount,
}: {
  companyId: string;
  monthKey: string;
  pendingCount: number;
}) {
  const [state, formAction] = useActionState(categorizeWithAiAction, initialState);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <form action={formAction}>
        <input type="hidden" name="companyId" value={companyId} />
        <input type="hidden" name="mes" value={monthKey} />
        <SubmitButton
          size="sm"
          disabled={pendingCount === 0}
          pendingLabel="Consultando a IA…"
        >
          <Sparkles className="size-4" aria-hidden="true" />
          Categorizar com IA
          {pendingCount > 0 && (
            <span className="text-xs opacity-75">({pendingCount})</span>
          )}
        </SubmitButton>
      </form>

      <FormFeedback state={state} />
    </div>
  );
}
