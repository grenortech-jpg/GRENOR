"use client";

import { Check, Copy, ExternalLink, FileDown, RefreshCw } from "lucide-react";
import { useActionState, useState } from "react";

import {
  rotateShareTokenAction,
  toggleShareAction,
  type ClosingState,
} from "@/app/(app)/empresas/[id]/fechamento/actions";
import { FormFeedback } from "@/components/forms/form-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";

const initialState: ClosingState = {};

export type SharePanelProps = {
  companyId: string;
  periodId: string | null;
  shareUrl: string | null;
  shareEnabled: boolean;
  closed: boolean;
};

/**
 * PDF e link compartilhavel (Secao 7).
 *
 * A geracao do PDF vai por fetch em vez de Server Action porque o resultado e
 * um arquivo: a rota devolve uma URL assinada de curta duracao, e o navegador
 * abre. Server Action teria que serializar o PDF inteiro na resposta.
 */
export function SharePanel({
  companyId,
  periodId,
  shareUrl,
  shareEnabled,
  closed,
}: SharePanelProps) {
  const [toggleState, toggle] = useActionState(toggleShareAction, initialState);
  const [rotateState, rotate] = useActionState(rotateShareTokenAction, initialState);

  const [generating, setGenerating] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generatePdf() {
    if (!periodId) return;

    setGenerating(true);
    setPdfError(null);

    try {
      const response = await fetch(`/api/relatorio/${periodId}/pdf`, {
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok) {
        setPdfError(data.error ?? "Não foi possível gerar o PDF.");
        return;
      }

      window.open(data.url, "_blank", "noopener");
    } catch {
      setPdfError("Não foi possível gerar o PDF. Tente novamente.");
    } finally {
      setGenerating(false);
    }
  }

  if (!closed) {
    return (
      <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
        Feche o período para gerar o PDF e liberar o link compartilhável.
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border p-5">
      <div>
        <h2 className="font-medium">Entregar ao cliente</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          O PDF é o relatório completo. O link abre a mesma coisa no navegador,
          sem login.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={generatePdf} disabled={generating || !periodId}>
          <FileDown className="size-4" aria-hidden="true" />
          {generating ? "Gerando PDF…" : "Gerar PDF"}
        </Button>

        <form action={toggle}>
          <input type="hidden" name="companyId" value={companyId} />
          <input type="hidden" name="periodId" value={periodId ?? ""} />
          <input
            type="hidden"
            name="enabled"
            value={shareEnabled ? "false" : "true"}
          />
          <SubmitButton variant="outline" pendingLabel="Salvando…">
            {shareEnabled ? "Desativar link" : "Ativar link compartilhável"}
          </SubmitButton>
        </form>
      </div>

      {pdfError && (
        <p role="alert" className="text-sm text-destructive">
          {pdfError}
        </p>
      )}

      {shareEnabled && shareUrl && (
        <div className="space-y-2 rounded-md bg-muted p-3">
          <p className="text-xs text-muted-foreground">
            Qualquer pessoa com este endereço vê o relatório.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1.5 font-mono text-xs">
              {shareUrl}
            </code>

            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(shareUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? (
                <Check className="size-4" aria-hidden="true" />
              ) : (
                <Copy className="size-4" aria-hidden="true" />
              )}
              {copied ? "Copiado" : "Copiar"}
            </Button>

            <a
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-accent"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              Abrir
            </a>
          </div>

          <form action={rotate}>
            <input type="hidden" name="companyId" value={companyId} />
            <input type="hidden" name="periodId" value={periodId ?? ""} />
            <SubmitButton
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              pendingLabel="Gerando…"
            >
              <RefreshCw className="size-3" aria-hidden="true" />
              Gerar novo link (invalida o atual)
            </SubmitButton>
          </form>
        </div>
      )}

      <FormFeedback state={toggleState} />
      <FormFeedback state={rotateState} />
    </div>
  );
}
