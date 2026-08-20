"use client";

import { useActionState } from "react";

import {
  createWorkspaceAction,
  updateWorkspaceAction,
  type FormState,
} from "@/app/(app)/actions";
import { FormFeedback } from "@/components/forms/form-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: FormState = {};

type WorkspaceFormProps = {
  mode: "create" | "edit";
  defaultName?: string;
};

export function WorkspaceForm({ mode, defaultName }: WorkspaceFormProps) {
  const [state, formAction] = useActionState(
    mode === "create" ? createWorkspaceAction : updateWorkspaceAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nome do escritório</Label>
        <Input
          id="name"
          name="name"
          defaultValue={defaultName}
          required
          maxLength={80}
          placeholder="Contabilidade Silva"
        />
        <p className="text-xs text-muted-foreground">
          Aparece no cabeçalho e nos relatórios que você entrega aos clientes.
        </p>
      </div>

      <FormFeedback state={state} />

      <SubmitButton pendingLabel="Salvando…">
        {mode === "create" ? "Continuar" : "Salvar alterações"}
      </SubmitButton>
    </form>
  );
}
