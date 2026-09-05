"use client";

import { ArrowLeftRight, Sparkles } from "lucide-react";
import { useActionState, useRef, useState } from "react";

import {
  acceptSuggestionAction,
  categorizeAction,
  dismissSuggestionAction,
  type ReconcileState,
} from "@/app/(app)/empresas/[id]/conciliacao/actions";
import { FormFeedback } from "@/components/forms/form-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { groupOptions, RuleDialog } from "@/components/reconciliation/rule-dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type { CategoryOption } from "@/lib/categories/list";
import { cn } from "@/lib/utils";

export type ReconcileRow = {
  id: string;
  date: string;
  description: string;
  amount: string;
  negative: boolean;
  accountNickname: string;
  categoryId: string | null;
  categorizedBy: "RULE" | "AI" | "MANUAL" | "NONE" | "MEMORY" | "CNPJ";
  aiConfidence: number | null;
  isTransfer: boolean;
  /** Palpite da IA abaixo do limiar, aguardando decisao do usuario. */
  suggestedCategoryId: string | null;
  suggestedCategoryName: string | null;
};

const initialState: ReconcileState = {};

const ORIGIN_LABELS: Record<ReconcileRow["categorizedBy"], string> = {
  RULE: "regra",
  AI: "IA",
  MANUAL: "manual",
  MEMORY: "memória",
  CNPJ: "CNPJ",
  NONE: "",
};

/**
 * Tabela do periodo com edicao em massa (Secao 9).
 *
 * A selecao vive aqui, no cliente, mas quem grava e a Server Action - a lista
 * de ids e revalidada contra o workspace antes de qualquer escrita.
 */
export function ReconciliationTable({
  companyId,
  monthKey,
  rows,
  categories,
}: {
  companyId: string;
  monthKey: string;
  rows: ReconcileRow[];
  categories: CategoryOption[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allSelected = rows.length > 0 && selected.size === rows.length;

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)));
  };

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <BulkBar
          companyId={companyId}
          categories={categories}
          selected={[...selected]}
          onDone={() => setSelected(new Set())}
        />
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-2">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Selecionar todos"
                />
              </th>
              <th className="px-3 py-2 text-left font-medium">Data</th>
              <th className="px-3 py-2 text-left font-medium">Descrição</th>
              <th className="px-3 py-2 text-right font-medium">Valor</th>
              <th className="px-3 py-2 text-left font-medium">Categoria</th>
              <th className="w-10 px-3 py-2" />
            </tr>
          </thead>

          <tbody className="divide-y">
            {rows.map((row) => (
              <tr
                key={row.id}
                className={cn(
                  "hover:bg-accent/30",
                  selected.has(row.id) && "bg-accent/40",
                  !row.categoryId && "bg-gold/[0.06]",
                )}
              >
                <td className="px-3 py-2">
                  <Checkbox
                    checked={selected.has(row.id)}
                    onCheckedChange={() => toggle(row.id)}
                    aria-label={`Selecionar ${row.description}`}
                  />
                </td>

                <td className="whitespace-nowrap px-3 py-2 tabular">{row.date}</td>

                <td className="px-3 py-2">
                  <span className="block max-w-[26rem] truncate">
                    {row.description}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {row.accountNickname}
                    {row.isTransfer && (
                      <>
                        {" · "}
                        <ArrowLeftRight
                          className="inline size-3"
                          aria-hidden="true"
                        />{" "}
                        transferência
                      </>
                    )}
                  </span>
                </td>

                <td
                  className={cn(
                    "whitespace-nowrap px-3 py-2 text-right tabular",
                    row.negative ? "text-negative" : "text-positive",
                  )}
                >
                  {row.negative ? "−" : "+"}
                  {row.amount}
                </td>

                <td className="px-3 py-2">
                  <RowCategory
                    companyId={companyId}
                    row={row}
                    categories={categories}
                  />
                  {row.suggestedCategoryId && (
                    <Suggestion companyId={companyId} row={row} />
                  )}
                </td>

                <td className="px-3 py-2">
                  <RuleDialog
                    companyId={companyId}
                    transactionId={row.id}
                    monthKey={monthKey}
                    description={row.description}
                    categoryId={row.categoryId}
                    categories={categories}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Seletor de categoria de uma linha. Grava ao mudar, sem botao. */
function RowCategory({
  companyId,
  row,
  categories,
}: {
  companyId: string;
  row: ReconcileRow;
  categories: CategoryOption[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(categorizeAction, initialState);

  return (
    <form ref={formRef} action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="transactionIds" value={row.id} />

      {/* `key` remonta o select quando a categoria muda por uma action
          (regras, memoria, CNPJ): defaultValue sozinho nao acompanha. */}
      <select
        key={row.categoryId ?? "none"}
        name="categoryId"
        defaultValue={row.categoryId ?? ""}
        onChange={() => formRef.current?.requestSubmit()}
        aria-label={`Categoria de ${row.description}`}
        className={cn(
          "h-8 w-52 rounded-md border bg-background px-2 text-sm",
          !row.categoryId && "border-gold/60",
        )}
      >
        <option value="">Sem categoria</option>
        {groupOptions(categories)}
      </select>

      {row.categorizedBy !== "NONE" && row.categoryId && (
        <Badge
          variant="secondary"
          className="shrink-0 gap-1 text-[10px] font-normal"
        >
          {row.categorizedBy === "AI" && (
            <Sparkles className="size-3" aria-hidden="true" />
          )}
          {ORIGIN_LABELS[row.categorizedBy]}
          {row.categorizedBy === "AI" && row.aiConfidence !== null && (
            <span>{Math.round(row.aiConfidence * 100)}%</span>
          )}
        </Badge>
      )}

      {state.error && (
        <span className="text-xs text-destructive">{state.error}</span>
      )}
    </form>
  );
}

/**
 * Sugestao da IA com confianca abaixo do limiar (Secao 5.3).
 *
 * Aparece destacada e NAO conta como categorizado: o lancamento segue pendente
 * ate o usuario aceitar ou descartar.
 */
function Suggestion({
  companyId,
  row,
}: {
  companyId: string;
  row: ReconcileRow;
}) {
  const [acceptState, accept] = useActionState(acceptSuggestionAction, initialState);
  const [dismissState, dismiss] = useActionState(dismissSuggestionAction, initialState);

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-md border border-gold/50 bg-gold/10 px-2 py-1">
      <Sparkles className="size-3 shrink-0 text-gold" aria-hidden="true" />
      <span className="text-xs">
        IA sugere <span className="font-medium">{row.suggestedCategoryName}</span>
        {row.aiConfidence !== null && (
          <span className="text-muted-foreground">
            {" "}
            ({Math.round(row.aiConfidence * 100)}% de confiança)
          </span>
        )}
      </span>

      <form action={accept} className="ml-auto">
        <input type="hidden" name="companyId" value={companyId} />
        <input type="hidden" name="transactionId" value={row.id} />
        <SubmitButton size="sm" variant="outline" className="h-6 px-2 text-xs" pendingLabel="…">
          Aceitar
        </SubmitButton>
      </form>

      <form action={dismiss}>
        <input type="hidden" name="companyId" value={companyId} />
        <input type="hidden" name="transactionId" value={row.id} />
        <SubmitButton size="sm" variant="ghost" className="h-6 px-2 text-xs" pendingLabel="…">
          Descartar
        </SubmitButton>
      </form>

      {(acceptState.error || dismissState.error) && (
        <span className="text-xs text-destructive">
          {acceptState.error ?? dismissState.error}
        </span>
      )}
    </div>
  );
}

/** Barra de edicao em massa, visivel apenas com linhas selecionadas. */
function BulkBar({
  companyId,
  categories,
  selected,
  onDone,
}: {
  companyId: string;
  categories: CategoryOption[];
  selected: string[];
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(categorizeAction, initialState);

  return (
    <form
      action={(formData) => {
        formAction(formData);
        onDone();
      }}
      className="flex flex-wrap items-center gap-3 rounded-lg border bg-accent/40 px-4 py-3"
    >
      <input type="hidden" name="companyId" value={companyId} />
      {selected.map((id) => (
        <input key={id} type="hidden" name="transactionIds" value={id} />
      ))}

      <span className="text-sm font-medium">
        {selected.length} selecionado{selected.length > 1 ? "s" : ""}
      </span>

      <select
        name="categoryId"
        defaultValue=""
        required
        aria-label="Categoria para os selecionados"
        className="h-9 w-56 rounded-md border bg-background px-3 text-sm"
      >
        <option value="" disabled>
          Escolha a categoria
        </option>
        {groupOptions(categories)}
      </select>

      <SubmitButton size="sm" pendingLabel="Aplicando…">
        Aplicar aos selecionados
      </SubmitButton>

      <FormFeedback state={state} />
    </form>
  );
}
