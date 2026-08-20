"use client";

import { Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useActionState } from "react";

import {
  createRuleAction,
  type ReconcileState,
} from "@/app/(app)/empresas/[id]/conciliacao/actions";
import { FormFeedback } from "@/components/forms/form-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CategoryOption } from "@/lib/categories/list";
import { MATCH_TYPE_LABELS } from "@/lib/rules/engine";

const initialState: ReconcileState = {};

/**
 * "Criar regra a partir desta correcao" (Secao 5.3).
 *
 * O padrao ja vem sugerido a partir da descricao: as primeiras palavras, que
 * sao a parte estavel. "PIX RECEBIDO JOSE ANTONIO PEREIRA" vira "PIX RECEBIDO",
 * porque o nome muda a cada lancamento e o prefixo nao.
 */
export function RuleDialog({
  companyId,
  monthKey,
  description,
  categoryId,
  categories,
}: {
  companyId: string;
  monthKey: string;
  description: string;
  categoryId: string | null;
  categories: CategoryOption[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createRuleAction, initialState);

  const suggested = useMemo(() => suggestPattern(description), [description]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Criar regra a partir deste lançamento"
          title="Criar regra"
        >
          <Wand2 className="size-4" aria-hidden="true" />
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar regra</DialogTitle>
          <DialogDescription>
            A partir de agora, todo lançamento que casar com este padrão recebe a
            categoria sozinho — neste mês e nos próximos.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="companyId" value={companyId} />
          <input type="hidden" name="mes" value={monthKey} />

          <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Lançamento de origem: <span className="font-mono">{description}</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="matchType">Comparação</Label>
              <select
                id="matchType"
                name="matchType"
                defaultValue="CONTAINS"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                {Object.entries(MATCH_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pattern">Padrão</Label>
              <Input
                id="pattern"
                name="pattern"
                defaultValue={suggested}
                required
                maxLength={200}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ruleCategoryId">Categoria</Label>
            <select
              id="ruleCategoryId"
              name="categoryId"
              defaultValue={categoryId ?? ""}
              required
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="" disabled>
                Escolha a categoria
              </option>
              {groupOptions(categories)}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="priority">Prioridade</Label>
            <Input
              id="priority"
              name="priority"
              type="number"
              defaultValue={100}
              min={1}
              max={999}
            />
            <p className="text-xs text-muted-foreground">
              Menor número decide primeiro. Use um valor baixo para regras
              específicas que devem vencer as gerais.
            </p>
          </div>

          <FormFeedback state={state} />

          <SubmitButton pendingLabel="Criando…">
            Criar regra e aplicar
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function groupOptions(categories: CategoryOption[]) {
  const groups = new Map<string, CategoryOption[]>();

  for (const category of categories) {
    const bucket = groups.get(category.groupLabel) ?? [];
    bucket.push(category);
    groups.set(category.groupLabel, bucket);
  }

  return [...groups.entries()].map(([label, items]) => (
    <optgroup key={label} label={label}>
      {items.map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
        </option>
      ))}
    </optgroup>
  ));
}

/**
 * Prefixo estavel da descricao: para em nome proprio, numero ou documento,
 * que sao as partes que mudam de um lancamento para o outro.
 */
function suggestPattern(description: string): string {
  const words = description.trim().split(/\s+/);
  const kept: string[] = [];

  for (const word of words) {
    // Numero, data ou documento marca o fim da parte estavel.
    if (/\d/.test(word) && kept.length > 0) break;
    kept.push(word);
    if (kept.length >= 3) break;
  }

  return kept.join(" ").slice(0, 60);
}
