"use client";

import { useActionState } from "react";

import {
  requestPasswordResetAction,
  type AuthFormState,
} from "@/app/(auth)/actions";
import { FormFeedback } from "@/components/auth/form-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthFormState = {};

export function ResetRequestForm() {
  const [state, formAction] = useActionState(
    requestPasswordResetAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="voce@escritorio.com.br"
        />
      </div>

      <FormFeedback state={state} />

      <SubmitButton className="w-full" pendingLabel="Enviando…">
        Enviar link de recuperação
      </SubmitButton>
    </form>
  );
}
