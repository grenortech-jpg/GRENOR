"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

import {
  deleteRuleAction,
  updateRuleAction,
  type ReconcileState,
} from "@/app/(app)/empresas/[id]/conciliacao/actions";
import { FormFeedback } from "@/components/forms/form-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { groupOptions } from "@/components/reconciliation/rule-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { cn } from "@/lib/utils";

export type RuleView = {
  id: string;
  matchType: "CONTAINS" | "STARTS_WITH" | "REGEX";
  pattern: string;
  priority: number;
  active: boolean;
  categoryId: string;
  categoryName: string;
};

const initialState: ReconcileState = {};

export function RulesManager({
  rules,
  categories,
}: {
  rules: RuleView[];
  categories: CategoryOption[];
}) {
  if (rules.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-6 py-12 text-center">
        <h2 className="font-medium">Nenhuma regra ainda</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          As regras nascem na conciliação: corrija a categoria de um lançamento e
          escolha &ldquo;criar regra&rdquo;. A partir daí, todo lançamento parecido se
          categoriza sozinho.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y rounded-lg border">
      {rules.map((rule) => (
        <li
          key={rule.id}
          className={cn(
            "flex flex-wrap items-center gap-3 px-4 py-3",
            !rule.active && "opacity-55",
          )}
        >
          <span className="w-10 shrink-0 text-xs text-muted-foreground tabular">
            {rule.priority}
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">
              <span className="text-muted-foreground">
                {MATCH_TYPE_LABELS[rule.matchType]}
              </span>{" "}
              <span className="font-mono">{rule.pattern}</span>
            </p>
            <p className="truncate text-xs text-muted-foreground">
              → {rule.categoryName}
            </p>
          </div>

          {!rule.active && (
            <Badge variant="secondary" className="text-[10px]">
              inativa
            </Badge>
          )}

          <div className="flex items-center gap-1">
            <EditRuleDialog rule={rule} categories={categories} />
            <DeleteRuleDialog rule={rule} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EditRuleDialog({
  rule,
  categories,
}: {
  rule: RuleView;
  categories: CategoryOption[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(updateRuleAction, initialState);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Editar regra ${rule.pattern}`}>
          <Pencil className="size-4" aria-hidden="true" />
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar regra</DialogTitle>
          <DialogDescription>
            Alterações valem para as próximas aplicações; lançamentos já
            categorizados não mudam sozinhos.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="ruleId" value={rule.id} />

          <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor={`match-${rule.id}`}>Comparação</Label>
              <select
                id={`match-${rule.id}`}
                name="matchType"
                defaultValue={rule.matchType}
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
              <Label htmlFor={`pattern-${rule.id}`}>Padrão</Label>
              <Input
                id={`pattern-${rule.id}`}
                name="pattern"
                defaultValue={rule.pattern}
                required
                maxLength={200}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`category-${rule.id}`}>Categoria</Label>
            <select
              id={`category-${rule.id}`}
              name="categoryId"
              defaultValue={rule.categoryId}
              required
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              {groupOptions(categories)}
            </select>
          </div>

          <div className="flex items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor={`priority-${rule.id}`}>Prioridade</Label>
              <Input
                id={`priority-${rule.id}`}
                name="priority"
                type="number"
                defaultValue={rule.priority}
                min={1}
                max={999}
                className="w-28"
              />
            </div>

            <label className="flex items-center gap-2 pb-2 text-sm">
              <Checkbox name="active" defaultChecked={rule.active} />
              Ativa
            </label>
          </div>

          <FormFeedback state={state} />

          <SubmitButton pendingLabel="Salvando…">Salvar</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteRuleDialog({ rule }: { rule: RuleView }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(deleteRuleAction, initialState);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Remover regra ${rule.pattern}`}>
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remover regra?</DialogTitle>
          <DialogDescription>
            Lançamentos já categorizados por ela continuam como estão. Apenas as
            próximas aplicações deixam de usá-la.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="ruleId" value={rule.id} />
          <FormFeedback state={state} />
          <SubmitButton variant="destructive" pendingLabel="Removendo…">
            Remover
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
