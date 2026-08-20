"use client";

import { Settings2, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

import { deleteCompanyAction, type FormState } from "@/app/(app)/actions";
import { CompanyForm } from "@/components/companies/company-form";
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

type CompanySettingsProps = {
  company: { id: string; name: string; cnpj: string | null; segment: string | null };
  canDelete: boolean;
};

export function CompanySettings({ company, canDelete }: CompanySettingsProps) {
  return (
    <div className="flex items-center gap-2">
      <EditDialog company={company} />
      {canDelete && <DeleteDialog company={company} />}
    </div>
  );
}

function EditDialog({ company }: { company: CompanySettingsProps["company"] }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="size-4" aria-hidden="true" />
          Editar
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar empresa</DialogTitle>
          <DialogDescription>
            Nome, CNPJ e segmento aparecem no relatório executivo.
          </DialogDescription>
        </DialogHeader>

        <CompanyForm
          mode="edit"
          companyId={company.id}
          defaults={{
            name: company.name,
            cnpj: company.cnpj,
            segment: company.segment,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

const initialState: FormState = {};

function DeleteDialog({ company }: { company: CompanySettingsProps["company"] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(deleteCompanyAction, initialState);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          <Trash2 className="size-4" aria-hidden="true" />
          Excluir
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir {company.name}?</DialogTitle>
          <DialogDescription>
            Apaga em definitivo as contas, lançamentos, períodos e relatórios
            desta empresa. Não há como desfazer.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="companyId" value={company.id} />

          <div className="space-y-2">
            <Label htmlFor="confirmation">
              Digite <span className="font-medium">{company.name}</span> para
              confirmar
            </Label>
            <Input id="confirmation" name="confirmation" autoComplete="off" required />
          </div>

          <FormFeedback state={state} />

          <SubmitButton variant="destructive" pendingLabel="Excluindo…">
            Excluir empresa
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
