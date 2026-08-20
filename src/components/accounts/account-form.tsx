"use client";

import { useActionState } from "react";

import {
  createAccountAction,
  updateAccountAction,
  type FormState,
} from "@/app/(app)/actions";
import { FormFeedback } from "@/components/forms/form-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: FormState = {};

type AccountFormProps = {
  mode: "create" | "edit";
  companyId: string;
  accountId?: string;
  defaults?: {
    bankName?: string;
    nickname?: string;
    openingBalance?: string;
    openingBalanceDate?: string;
  };
  next?: "onboarding";
  submitLabel?: string;
};

export function AccountForm({
  mode,
  companyId,
  accountId,
  defaults,
  next,
  submitLabel,
}: AccountFormProps) {
  const [state, formAction] = useActionState(
    mode === "create" ? createAccountAction : updateAccountAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="companyId" value={companyId} />
      {accountId && <input type="hidden" name="accountId" value={accountId} />}
      {next && <input type="hidden" name="next" value={next} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="bankName">Banco</Label>
          <Input
            id="bankName"
            name="bankName"
            defaultValue={defaults?.bankName}
            required
            maxLength={60}
            placeholder="Itaú"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="nickname">Apelido da conta</Label>
          <Input
            id="nickname"
            name="nickname"
            defaultValue={defaults?.nickname}
            required
            maxLength={60}
            placeholder="Conta movimento"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="openingBalanceCents">Saldo inicial</Label>
          <Input
            id="openingBalanceCents"
            name="openingBalanceCents"
            defaultValue={defaults?.openingBalance}
            required
            inputMode="decimal"
            placeholder="12.500,00"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="openingBalanceDate">Data do saldo</Label>
          <Input
            id="openingBalanceDate"
            name="openingBalanceDate"
            type="date"
            defaultValue={defaults?.openingBalanceDate}
            required
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        O saldo inicial é o saldo da conta na véspera do primeiro extrato que
        você vai importar. Sem ele não há saldo consolidado nem evolução do
        saldo no relatório. Use sinal negativo se a conta estava no vermelho.
      </p>

      <FormFeedback state={state} />

      <SubmitButton pendingLabel="Salvando…">
        {submitLabel ?? (mode === "create" ? "Cadastrar conta" : "Salvar alterações")}
      </SubmitButton>
    </form>
  );
}
