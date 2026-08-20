"use client";

import { AlertTriangle, CheckCircle2, Lock, LockOpen } from "lucide-react";
import { useActionState } from "react";

import {
  closePeriodAction,
  reopenPeriodAction,
  type ClosingState,
} from "@/app/(app)/empresas/[id]/fechamento/actions";
import { FormFeedback } from "@/components/forms/form-feedback";
import { SubmitButton } from "@/components/forms/submit-button";

const initialState: ClosingState = {};

export type ClosingChecklist = {
  totalCount: number;
  pendingCount: number;
  accountsWithoutOpening: number;
  transactionsBeforeOpening: number;
  closed: boolean;
  closedAt: string | null;
};

/**
 * Checklist e fechamento (Secao 9, tela 7).
 *
 * O checklist existe para o usuario ver POR QUE o botao esta bloqueado, em vez
 * de descobrir clicando.
 */
export function ClosingPanel({
  companyId,
  monthKey,
  monthLabel,
  checklist,
}: {
  companyId: string;
  monthKey: string;
  monthLabel: string;
  checklist: ClosingChecklist;
}) {
  const [closeState, close] = useActionState(closePeriodAction, initialState);
  const [reopenState, reopen] = useActionState(reopenPeriodAction, initialState);

  const canClose = checklist.totalCount > 0 && checklist.pendingCount === 0;

  return (
    <div className="rounded-lg border p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 font-medium">
            {checklist.closed ? (
              <Lock className="size-4 text-positive" aria-hidden="true" />
            ) : (
              <LockOpen className="size-4 text-muted-foreground" aria-hidden="true" />
            )}
            {checklist.closed ? "Período fechado" : "Fechar o período"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {checklist.closed
              ? `${monthLabel} foi fechado${checklist.closedAt ? ` em ${checklist.closedAt}` : ""}. Os números do relatório estão congelados.`
              : `Ao fechar ${monthLabel}, os números são congelados e passam a ser a base do relatório.`}
          </p>
        </div>

        {checklist.closed ? (
          <form action={reopen}>
            <input type="hidden" name="companyId" value={companyId} />
            <input type="hidden" name="mes" value={monthKey} />
            <SubmitButton variant="outline" pendingLabel="Reabrindo…">
              Reabrir período
            </SubmitButton>
          </form>
        ) : (
          <form action={close}>
            <input type="hidden" name="companyId" value={companyId} />
            <input type="hidden" name="mes" value={monthKey} />
            <SubmitButton disabled={!canClose} pendingLabel="Fechando…">
              Fechar {monthLabel}
            </SubmitButton>
          </form>
        )}
      </div>

      <ul className="mt-4 space-y-2 text-sm">
        <Check
          ok={checklist.totalCount > 0}
          label={
            checklist.totalCount > 0
              ? `${checklist.totalCount} lançamento(s) importado(s)`
              : "Nenhum lançamento importado neste mês"
          }
        />
        <Check
          ok={checklist.pendingCount === 0}
          label={
            checklist.pendingCount === 0
              ? "Todos os lançamentos categorizados"
              : `${checklist.pendingCount} lançamento(s) ainda sem categoria`
          }
        />
        <Check
          ok={checklist.accountsWithoutOpening === 0}
          label={
            checklist.accountsWithoutOpening === 0
              ? "Todas as contas com saldo inicial"
              : `${checklist.accountsWithoutOpening} conta(s) sem saldo inicial`
          }
        />
        {checklist.transactionsBeforeOpening > 0 && (
          <li className="flex items-start gap-2 text-muted-foreground">
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0 text-gold"
              aria-hidden="true"
            />
            <span>
              {checklist.transactionsBeforeOpening} lançamento(s) são anteriores à
              data do saldo inicial e ficam de fora do saldo consolidado. Ajuste a
              data do saldo inicial da conta para uma véspera do primeiro extrato.
            </span>
          </li>
        )}
      </ul>

      <div className="mt-4">
        <FormFeedback state={closeState} />
        <FormFeedback state={reopenState} />
      </div>
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? (
        <CheckCircle2
          className="mt-0.5 size-4 shrink-0 text-positive"
          aria-hidden="true"
        />
      ) : (
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0 text-gold"
          aria-hidden="true"
        />
      )}
      <span className={ok ? "" : "text-muted-foreground"}>{label}</span>
    </li>
  );
}
