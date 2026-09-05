"use client";

import { Mail, RefreshCw } from "lucide-react";
import { useActionState } from "react";

import {
  rotateInboundTokenAction,
  updateInboundEmailAction,
  type FormState,
} from "@/app/(app)/actions";
import { FormFeedback } from "@/components/forms/form-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

const initialState: FormState = {};

/**
 * Extratos por e-mail (Fase 12): endereco dedicado da empresa, remetentes
 * autorizados e troca de endereco.
 */
export function InboundEmailCard({
  companyId,
  enabled,
  senders,
  address,
  accountAddresses,
  domainConfigured,
}: {
  companyId: string;
  enabled: boolean;
  senders: string[];
  /** null enquanto nao ha token ou dominio. */
  address: string | null;
  /** Um endereco por conta quando a empresa tem mais de uma. */
  accountAddresses: { nickname: string; address: string }[];
  domainConfigured: boolean;
}) {
  const [state, action] = useActionState(updateInboundEmailAction, initialState);
  const [rotateState, rotate] = useActionState(rotateInboundTokenAction, initialState);

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="flex items-start gap-3">
          <Mail className="mt-0.5 size-5 text-muted-foreground" aria-hidden="true" />
          <div>
            <h2 className="font-medium">Extratos por e-mail</h2>
            <p className="text-sm text-muted-foreground">
              O banco (ou o cliente) envia o extrato em anexo para um endereço
              só desta empresa, e ele entra como uma importação normal — sem
              duplicar nada.
            </p>
          </div>
        </div>

        {!domainConfigured ? (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            O domínio de recebimento ainda não foi configurado neste ambiente
            (INBOUND_EMAIL_DOMAIN). Veja infra/cloudflare/email-worker/README.md.
          </p>
        ) : address ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Endereço</p>
            {accountAddresses.length > 1 ? (
              <ul className="space-y-1 text-sm">
                {accountAddresses.map((entry) => (
                  <li key={entry.address} className="flex flex-wrap gap-x-3">
                    <span className="text-muted-foreground">{entry.nickname}:</span>
                    <code className="select-all rounded bg-muted px-1.5 py-0.5">{entry.address}</code>
                  </li>
                ))}
              </ul>
            ) : (
              <code className="block select-all rounded bg-muted px-2 py-1.5 text-sm">
                {address}
              </code>
            )}
            {!enabled && (
              <p className="text-xs text-muted-foreground">
                Desativado: mensagens para este endereço são recusadas.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            O endereço é gerado ao salvar pela primeira vez.
          </p>
        )}

        <form action={action} className="space-y-4">
          <input type="hidden" name="companyId" value={companyId} />

          <div className="space-y-2">
            <Label htmlFor={`senders-${companyId}`}>Remetentes autorizados</Label>
            <textarea
              id={`senders-${companyId}`}
              name="senders"
              rows={3}
              defaultValue={senders.join("\n")}
              placeholder={"extrato@banco.com.br\nfinanceiro@cliente.com.br"}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Um por linha. Mensagem de qualquer outro remetente é recusada.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="enabled" defaultChecked={enabled} className="size-4 accent-brand" />
            Receber extratos neste endereço
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton size="sm" pendingLabel="Salvando…">
              Salvar
            </SubmitButton>
            <FormFeedback state={state} />
          </div>
        </form>

        {address && (
          <form action={rotate} className="flex flex-wrap items-center gap-3 border-t pt-4">
            <input type="hidden" name="companyId" value={companyId} />
            <SubmitButton variant="outline" size="sm" pendingLabel="Gerando…">
              <RefreshCw className="size-4" aria-hidden="true" />
              Gerar novo endereço
            </SubmitButton>
            <span className="text-xs text-muted-foreground">
              Use se o endereço vazou. O antigo para de funcionar na hora.
            </span>
            <FormFeedback state={rotateState} />
          </form>
        )}
      </CardContent>
    </Card>
  );
}
