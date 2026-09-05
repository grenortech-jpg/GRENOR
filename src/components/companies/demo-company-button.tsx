"use client";

import { Sparkles } from "lucide-react";
import { useActionState } from "react";

import { createDemoCompanyAction, type FormState } from "@/app/(app)/actions";
import { FormFeedback } from "@/components/forms/form-feedback";
import { SubmitButton } from "@/components/forms/submit-button";

const initialState: FormState = {};

/** Cria (ou recria) a Padaria de demonstracao com tres meses de dados. */
export function DemoCompanyButton({
  variant = "outline",
  label = "Criar empresa de demonstração",
}: {
  variant?: "outline" | "default" | "ghost";
  label?: string;
}) {
  const [state, action] = useActionState(createDemoCompanyAction, initialState);

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <SubmitButton variant={variant} size="sm" pendingLabel="Criando…">
        <Sparkles className="size-4" aria-hidden="true" />
        {label}
      </SubmitButton>
      <FormFeedback state={state} />
    </form>
  );
}
