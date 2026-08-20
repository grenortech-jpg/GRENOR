"use client";

import { Landmark, Pencil, Plus, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

import { deleteAccountAction, type FormState } from "@/app/(app)/actions";
import { AccountForm } from "@/components/accounts/account-form";
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

export type AccountView = {
  id: string;
  bankName: string;
  nickname: string;
  openingBalance: string;
  openingBalanceInput: string;
  openingBalanceDate: string;
  openingBalanceDateInput: string;
  transactionsCount: number;
};

export function AccountList({
  companyId,
  accounts,
}: {
  companyId: string;
  accounts: AccountView[];
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Contas bancárias</h2>
        <NewAccountDialog companyId={companyId} />
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-lg border border-dashed px-6 py-10 text-center">
          <Landmark
            className="mx-auto size-6 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="mt-3 text-sm font-medium">Nenhuma conta cadastrada</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Sem conta bancária não há como importar extratos.
          </p>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{account.nickname}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {account.bankName} · saldo inicial {account.openingBalance} em{" "}
                  {account.openingBalanceDate}
                </p>
              </div>

              <span className="text-xs text-muted-foreground tabular">
                {account.transactionsCount === 0
                  ? "sem lançamentos"
                  : `${account.transactionsCount} lançamentos`}
              </span>

              <div className="flex items-center gap-1">
                <EditAccountDialog companyId={companyId} account={account} />
                <DeleteAccountDialog account={account} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewAccountDialog({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="size-4" aria-hidden="true" />
          Nova conta
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova conta bancária</DialogTitle>
          <DialogDescription>
            Informe o saldo inicial e a data a que ele se refere.
          </DialogDescription>
        </DialogHeader>

        <AccountForm mode="create" companyId={companyId} />
      </DialogContent>
    </Dialog>
  );
}

function EditAccountDialog({
  companyId,
  account,
}: {
  companyId: string;
  account: AccountView;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Editar ${account.nickname}`}>
          <Pencil className="size-4" aria-hidden="true" />
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar conta</DialogTitle>
          <DialogDescription>
            Alterar o saldo inicial recalcula o saldo consolidado dos relatórios.
          </DialogDescription>
        </DialogHeader>

        <AccountForm
          mode="edit"
          companyId={companyId}
          accountId={account.id}
          defaults={{
            bankName: account.bankName,
            nickname: account.nickname,
            openingBalance: account.openingBalanceInput,
            openingBalanceDate: account.openingBalanceDateInput,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

const initialState: FormState = {};

function DeleteAccountDialog({ account }: { account: AccountView }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(deleteAccountAction, initialState);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Remover ${account.nickname}`}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remover {account.nickname}?</DialogTitle>
          <DialogDescription>
            {account.transactionsCount > 0
              ? "Esta conta tem lançamentos importados e não pode ser removida."
              : "Esta ação não pode ser desfeita."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="accountId" value={account.id} />
          <FormFeedback state={state} />
          <SubmitButton
            variant="destructive"
            pendingLabel="Removendo…"
            disabled={account.transactionsCount > 0}
          >
            Remover conta
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
