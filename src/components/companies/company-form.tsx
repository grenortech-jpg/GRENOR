"use client";

import { useActionState } from "react";

import {
  createCompanyAction,
  updateCompanyAction,
  type FormState,
} from "@/app/(app)/actions";
import { FormFeedback } from "@/components/forms/form-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: FormState = {};

type CompanyFormProps = {
  mode: "create" | "edit";
  companyId?: string;
  defaults?: { name?: string; cnpj?: string | null; segment?: string | null };
  /** "onboarding" encadeia o wizard para o passo da conta bancaria. */
  next?: "onboarding";
  submitLabel?: string;
};

export function CompanyForm({
  mode,
  companyId,
  defaults,
  next,
  submitLabel,
}: CompanyFormProps) {
  const [state, formAction] = useActionState(
    mode === "create" ? createCompanyAction : updateCompanyAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      {companyId && (
        <input type="hidden" name="companyId" value={companyId} />
      )}
      {next && <input type="hidden" name="next" value={next} />}

      <div className="space-y-2">
        <Label htmlFor="name">Nome da empresa</Label>
        <Input
          id="name"
          name="name"
          defaultValue={defaults?.name}
          required
          maxLength={120}
          placeholder="Padaria do Bairro Ltda"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cnpj">
            CNPJ <span className="text-muted-foreground">(opcional)</span>
          </Label>
          <Input
            id="cnpj"
            name="cnpj"
            defaultValue={defaults?.cnpj ?? ""}
            inputMode="numeric"
            placeholder="12.345.678/0001-95"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="segment">
            Segmento <span className="text-muted-foreground">(opcional)</span>
          </Label>
          <Input
            id="segment"
            name="segment"
            defaultValue={defaults?.segment ?? ""}
            maxLength={80}
            placeholder="Comércio varejista"
          />
        </div>
      </div>

      <FormFeedback state={state} />

      <SubmitButton pendingLabel="Salvando…">
        {submitLabel ?? (mode === "create" ? "Cadastrar empresa" : "Salvar alterações")}
      </SubmitButton>
    </form>
  );
}
