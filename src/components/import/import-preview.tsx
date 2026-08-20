"use client";

import { AlertTriangle, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useActionState } from "react";

import {
  confirmImportAction,
  discardImportAction,
  repreviewAction,
  type ImportPreview,
  type ImportState,
} from "@/app/(app)/empresas/[id]/importar/actions";
import { FormFeedback } from "@/components/forms/form-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const initialState: ImportState = {};

/**
 * Resumo do que sera importado, antes de gravar. Mostra duplicatas destacadas
 * em vez de escondê-las: o usuario precisa entender por que 40 lancamentos
 * viraram 12.
 */
export function ImportPreviewPanel({ preview }: { preview: ImportPreview }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="secondary">{preview.fileType}</Badge>
        <span className="truncate font-medium text-foreground">
          {preview.fileName}
        </span>
        {preview.encoding && <span>· {preview.encoding}</span>}
        {preview.separator && <span>· separador &quot;{preview.separator}&quot;</span>}
        {preview.accountHint && <span>· conta {preview.accountHint}</span>}
      </div>

      {preview.sheetNames && preview.sheetNames.length > 1 && (
        <SheetPicker preview={preview} />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Lançamentos no arquivo" value={String(preview.rowsTotal)} />
        <Stat
          label="Novos"
          value={String(preview.rowsNew)}
          tone={preview.rowsNew > 0 ? "positive" : undefined}
        />
        <Stat
          label="Duplicados"
          value={String(preview.rowsDuplicated)}
          hint={preview.rowsDuplicated > 0 ? "já existem nesta conta" : undefined}
        />
        <Stat
          label="Período"
          value={
            preview.firstDate && preview.lastDate
              ? `${preview.firstDate} a ${preview.lastDate}`
              : "—"
          }
        />
      </div>

      {preview.rowsNew > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <ArrowUpRight className="size-5 text-positive" aria-hidden="true" />
              <div>
                <p className="text-xs text-muted-foreground">Entradas</p>
                <p className="font-medium tabular">
                  {formatMoney(preview.inflowCents)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <ArrowDownLeft className="size-5 text-negative" aria-hidden="true" />
              <div>
                <p className="text-xs text-muted-foreground">Saídas</p>
                <p className="font-medium tabular">
                  {formatMoney(Math.abs(preview.outflowCents))}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {preview.warnings.length > 0 && (
        <div className="rounded-lg border border-gold/40 bg-gold/10 p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="size-4 text-gold" aria-hidden="true" />
            Linhas que não viraram lançamento
          </p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {preview.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {preview.rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Data</th>
                <th className="px-4 py-2 text-left font-medium">Descrição</th>
                <th className="px-4 py-2 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {preview.rows.map((row, index) => (
                <tr
                  key={index}
                  className={cn(row.duplicate && "bg-muted/40 text-muted-foreground")}
                >
                  <td className="whitespace-nowrap px-4 py-2 tabular">{row.date}</td>
                  <td className="px-4 py-2">
                    {row.description}
                    {row.duplicate && (
                      <Badge variant="secondary" className="ml-2 text-[10px]">
                        duplicado
                      </Badge>
                    )}
                  </td>
                  <td
                    className={cn(
                      "whitespace-nowrap px-4 py-2 text-right tabular",
                      row.negative ? "text-negative" : "text-positive",
                    )}
                  >
                    {row.negative ? "−" : "+"}
                    {row.amount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {preview.rowsTotal > preview.rows.length && (
            <p className="border-t px-4 py-2 text-xs text-muted-foreground">
              Mostrando os primeiros {preview.rows.length} de {preview.rowsTotal}{" "}
              lançamentos. Todos serão importados.
            </p>
          )}
        </div>
      )}

      <ConfirmBar preview={preview} />
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "positive";
}) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold tabular",
          tone === "positive" && "text-positive",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SheetPicker({ preview }: { preview: ImportPreview }) {
  const [state, formAction] = useActionState(repreviewAction, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="batchId" value={preview.batchId} />

      <div className="space-y-1.5">
        <label htmlFor="sheetName" className="text-sm font-medium">
          Aba da planilha
        </label>
        <select
          id="sheetName"
          name="sheetName"
          defaultValue={preview.sheetName}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          {preview.sheetNames?.map((sheet) => (
            <option key={sheet} value={sheet}>
              {sheet}
            </option>
          ))}
        </select>
      </div>

      <SubmitButton variant="outline" pendingLabel="Relendo…">
        Reler com esta aba
      </SubmitButton>

      <FormFeedback state={state} />
    </form>
  );
}

function ConfirmBar({ preview }: { preview: ImportPreview }) {
  const [confirmState, confirm] = useActionState(confirmImportAction, initialState);
  const [discardState, discard] = useActionState(discardImportAction, initialState);

  const nothingToImport = preview.rowsNew === 0;

  return (
    <div className="space-y-3">
      <FormFeedback state={confirmState} />
      <FormFeedback state={discardState} />

      {nothingToImport && preview.rowsTotal > 0 && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          Todos os {preview.rowsTotal} lançamentos deste arquivo já foram
          importados antes. Nada será duplicado.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <form action={confirm}>
          <input type="hidden" name="batchId" value={preview.batchId} />
          {preview.sheetName && (
            <input type="hidden" name="sheetName" value={preview.sheetName} />
          )}
          {preview.separator && (
            <input type="hidden" name="separator" value={preview.separator} />
          )}
          <SubmitButton disabled={nothingToImport} pendingLabel="Importando…">
            {nothingToImport
              ? "Nada a importar"
              : `Importar ${preview.rowsNew} lançamento${preview.rowsNew > 1 ? "s" : ""}`}
          </SubmitButton>
        </form>

        <form action={discard}>
          <input type="hidden" name="batchId" value={preview.batchId} />
          <SubmitButton variant="ghost" pendingLabel="Descartando…">
            Descartar
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
