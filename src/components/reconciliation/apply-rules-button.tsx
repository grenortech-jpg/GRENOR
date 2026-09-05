"use client";

import { Zap } from "lucide-react";
import { useActionState } from "react";

import {
  autoCategorizeAction,
  type ReconcileState,
} from "@/app/(app)/empresas/[id]/conciliacao/actions";
import { FormFeedback } from "@/components/forms/form-feedback";
import { SubmitButton } from "@/components/forms/submit-button";

const initialState: ReconcileState = {};

/**
 * Categorizacao automatica (Fase 11): memoria do workspace, CNPJ/CNAE e
 * regras, nesta ordem, sobre o que ainda esta sem categoria.
 */
export function ApplyRulesButton({
  companyId,
  monthKey,
  pendingCount,
}: {
  companyId: string;
  monthKey: string;
  pendingCount: number;
}) {
  const [state, formAction] = useActionState(autoCategorizeAction, initialState);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <form action={formAction}>
        <input type="hidden" name="companyId" value={companyId} />
        <input type="hidden" name="mes" value={monthKey} />
        <SubmitButton
          variant="outline"
          size="sm"
          disabled={pendingCount === 0}
          pendingLabel="Categorizando…"
        >
          <Zap className="size-4" aria-hidden="true" />
          Categorizar automaticamente
        </SubmitButton>
      </form>

      <FormFeedback state={state} />
    </div>
  );
}
