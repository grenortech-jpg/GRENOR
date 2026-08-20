"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { CompanyForm } from "@/components/companies/company-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function NewCompanyDialog({ label = "Nova empresa" }: { label?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" aria-hidden="true" />
          {label}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova empresa</DialogTitle>
          <DialogDescription>
            Depois de cadastrar, você adiciona as contas bancárias dela.
          </DialogDescription>
        </DialogHeader>

        <CompanyForm mode="create" />
      </DialogContent>
    </Dialog>
  );
}
