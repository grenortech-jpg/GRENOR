"use client";

import { Columns3 } from "lucide-react";
import { useState } from "react";

import type {
  ImportPreview,
  ImportState,
} from "@/app/(app)/empresas/[id]/importar/actions";
import { FormFeedback } from "@/components/forms/form-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Mapeamento manual de colunas (Secao 9).
 *
 * Existe para o caso em que a deteccao automatica erra - e ela erra, porque
 * planilha de banco nao tem padrao. Sem esta tela, um arquivo com coluna de
 * saldo ao lado da de valor importa o numero errado e o usuario nao tem
 * nenhuma forma de corrigir.
 *
 * Tambem e o que permite importar planilha que nao veio de banco nenhum: basta
 * dizer qual coluna e data, qual e descricao e qual e valor.
 */
export function ColumnMapper({
  preview,
  defaultOpen = false,
  action,
  feedback,
}: {
  preview: ImportPreview;
  defaultOpen?: boolean;
  /** Action de reprocessamento, cujo estado vive no painel. */
  action: (formData: FormData) => void;
  feedback: ImportState;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [useSplit, setUseSplit] = useState(
    preview.mapping?.credit !== undefined || preview.mapping?.debit !== undefined,
  );

  const sample = preview.sampleRows ?? [];
  if (sample.length === 0) return null;

  const columnCount = Math.max(...sample.map((row) => row.length));
  const columns = Array.from({ length: columnCount }, (_, index) => index);

  const label = (index: number) => {
    const header = preview.headers?.[index]?.trim();
    return header ? `${letter(index)} · ${header}` : `Coluna ${letter(index)}`;
  };

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium hover:bg-accent/40"
        aria-expanded={open}
      >
        <Columns3 className="size-4 text-muted-foreground" aria-hidden="true" />
        Colunas do arquivo
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          {open ? "ocultar" : "as colunas não foram lidas como você esperava?"}
        </span>
      </button>

      {open && (
        <div className="space-y-5 border-t p-4">
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  {columns.map((index) => (
                    <th
                      key={index}
                      className={cn(
                        "whitespace-nowrap px-3 py-1.5 text-left font-medium",
                        isMapped(preview, index) && "text-brand",
                      )}
                    >
                      {letter(index)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {sample.slice(0, 6).map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {columns.map((index) => (
                      <td
                        key={index}
                        className="max-w-[16rem] truncate px-3 py-1.5 text-muted-foreground"
                      >
                        {row[index] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form action={action} className="space-y-4">
            <input type="hidden" name="batchId" value={preview.batchId} />
            {preview.sheetName && (
              <input type="hidden" name="sheetName" value={preview.sheetName} />
            )}
            {preview.separator && (
              <input type="hidden" name="separator" value={preview.separator} />
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                name="map_date"
                label="Data"
                columns={columns}
                labelFor={label}
                defaultValue={preview.mapping?.date}
                required
              />
              <Select
                name="map_description"
                label="Descrição"
                columns={columns}
                labelFor={label}
                defaultValue={preview.mapping?.description}
                required
              />
            </div>

            {useSplit ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  name="map_credit"
                  label="Entradas (crédito)"
                  columns={columns}
                  labelFor={label}
                  defaultValue={preview.mapping?.credit}
                />
                <Select
                  name="map_debit"
                  label="Saídas (débito)"
                  columns={columns}
                  labelFor={label}
                  defaultValue={preview.mapping?.debit}
                />
              </div>
            ) : (
              <Select
                name="map_amount"
                label="Valor"
                hint="A coluna com o valor do lançamento, não a de saldo."
                columns={columns}
                labelFor={label}
                defaultValue={preview.mapping?.amount}
              />
            )}

            <button
              type="button"
              onClick={() => setUseSplit((value) => !value)}
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {useSplit
                ? "O arquivo tem uma única coluna de valor"
                : "O arquivo tem colunas separadas de entrada e saída"}
            </button>

            <FormFeedback state={feedback} />

            <div className="flex gap-2">
              <SubmitButton pendingLabel="Relendo…">
                Reler com estas colunas
              </SubmitButton>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Select({
  name,
  label,
  hint,
  columns,
  labelFor,
  defaultValue,
  required,
}: {
  name: string;
  label: string;
  hint?: string;
  columns: number[];
  labelFor: (index: number) => string;
  defaultValue?: number;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
      >
        <option value="">— não usar —</option>
        {columns.map((index) => (
          <option key={index} value={index}>
            {labelFor(index)}
          </option>
        ))}
      </select>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function isMapped(preview: ImportPreview, index: number): boolean {
  const mapping = preview.mapping;
  if (!mapping) return false;

  return (
    mapping.date === index ||
    mapping.description === index ||
    mapping.amount === index ||
    mapping.credit === index ||
    mapping.debit === index
  );
}

/** Coluna 0 vira "A", como numa planilha. */
function letter(index: number): string {
  let value = index;
  let result = "";

  do {
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);

  return result;
}
