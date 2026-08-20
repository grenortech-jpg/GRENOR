"use client";

import { useActionState } from "react";

import {
  uploadStatementAction,
  type ImportState,
} from "@/app/(app)/empresas/[id]/importar/actions";
import { Dropzone } from "@/components/import/dropzone";
import { ImportPreviewPanel } from "@/components/import/import-preview";
import { FormFeedback } from "@/components/forms/form-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card, CardContent } from "@/components/ui/card";

const initialState: ImportState = {};

export type AccountOption = {
  id: string;
  label: string;
};

export function ImportFlow({ accounts }: { accounts: AccountOption[] }) {
  const [state, formAction] = useActionState(uploadStatementAction, initialState);

  if (state.preview) {
    return <ImportPreviewPanel preview={state.preview} />;
  }

  return (
    <Card>
      <CardContent className="space-y-5 py-6">
        <form action={formAction} className="space-y-5">
          {accounts.length > 1 ? (
            <div className="space-y-1.5">
              <label htmlFor="accountId" className="text-sm font-medium">
                Conta de destino
              </label>
              <select
                id="accountId"
                name="accountId"
                required
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <input type="hidden" name="accountId" value={accounts[0]?.id} />
          )}

          <Dropzone />

          <FormFeedback state={state} />

          <SubmitButton className="w-full" pendingLabel="Lendo o extrato…">
            Ler extrato
          </SubmitButton>
        </form>

        <p className="text-xs text-muted-foreground">
          O arquivo é guardado como você enviou, para conferência posterior.
          Reimportar o mesmo extrato não duplica lançamentos.
        </p>
      </CardContent>
    </Card>
  );
}
