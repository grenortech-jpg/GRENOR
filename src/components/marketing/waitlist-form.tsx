"use client";

import { useActionState } from "react";

import { joinWaitlistAction, type WaitlistState } from "@/app/actions";
import { FormFeedback } from "@/components/forms/form-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: WaitlistState = {};

/**
 * Lista de espera da pagina publica (Fase 8).
 *
 * Depois do sucesso o formulario some e da lugar a confirmacao: deixar os
 * campos preenchidos na tela convida a reenviar, e o visitante fica sem saber
 * se funcionou.
 */
export function WaitlistForm() {
  const [state, action] = useActionState(joinWaitlistAction, initialState);

  if (state.success) {
    return (
      <div className="rounded-lg border border-positive/30 bg-positive/5 p-6">
        <p className="font-medium text-positive">{state.success}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Enquanto isso, se você já tem contrato conosco,{" "}
          <a href="/login" className="underline underline-offset-4">
            entre na sua conta
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="waitlist-name">Seu nome</Label>
          <Input
            id="waitlist-name"
            name="name"
            autoComplete="name"
            placeholder="Opcional"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="waitlist-office">Escritório</Label>
          <Input
            id="waitlist-office"
            name="office"
            autoComplete="organization"
            placeholder="Opcional"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="waitlist-email">E-mail</Label>
        <Input
          id="waitlist-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="voce@escritorio.com.br"
        />
      </div>

      {/* Armadilha para robo de formulario: invisivel e fora da ordem de tab. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="waitlist-website">Não preencha este campo</label>
        <input
          id="waitlist-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <SubmitButton size="lg" className="w-full sm:w-auto" pendingLabel="Enviando…">
        Entrar na lista de espera
      </SubmitButton>

      <FormFeedback state={state} />
    </form>
  );
}
