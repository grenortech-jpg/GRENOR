import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { AccountForm } from "@/components/accounts/account-form";
import { CompanyForm } from "@/components/companies/company-form";
import {
  isOnboardingStep,
  OnboardingSteps,
  type OnboardingStep,
} from "@/components/onboarding/steps";
import { WorkspaceForm } from "@/components/workspace/workspace-form";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import {
  assertCompanyInWorkspace,
  getCurrentWorkspace,
} from "@/lib/auth/workspace";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Primeiros passos" };

/**
 * Wizard da Secao 9: escritorio -> primeira empresa -> primeira conta.
 *
 * O passo vem da URL, mas quem manda e o estado real no banco: alguem que
 * volte para /onboarding?passo=empresa sem ter workspace e devolvido ao passo 1.
 */
export default async function OnboardingPage({
  searchParams,
}: PageProps<"/onboarding">) {
  await requireUser();

  const params = await searchParams;
  const requested = typeof params.passo === "string" ? params.passo : "";
  const companyParam = typeof params.empresa === "string" ? params.empresa : "";

  const context = await getCurrentWorkspace();

  if (!context) {
    return (
      <OnboardingShell
        step="workspace"
        title="Vamos começar pelo seu escritório"
        description="É o espaço onde ficam todas as empresas que você atende."
      >
        <WorkspaceForm mode="create" />
      </OnboardingShell>
    );
  }

  const step: OnboardingStep = isOnboardingStep(requested)
    ? requested
    : "empresa";

  if (step === "workspace") redirect("/onboarding?passo=empresa");

  if (step === "empresa") {
    return (
      <OnboardingShell
        step="empresa"
        title="Cadastre a primeira empresa"
        description="Cada empresa cliente tem seu próprio plano de contas, extratos e relatórios."
      >
        <CompanyForm mode="create" next="onboarding" submitLabel="Continuar" />
      </OnboardingShell>
    );
  }

  if (step === "conta") {
    const company = companyParam
      ? await assertCompanyInWorkspace(companyParam, context)
      : await prisma.company.findFirst({
          where: { workspaceId: context.workspace.id },
          orderBy: { createdAt: "desc" },
        });

    if (!company) redirect("/onboarding?passo=empresa");

    return (
      <OnboardingShell
        step="conta"
        title={`Conta bancária de ${company.name}`}
        description="É para onde os extratos vão ser importados."
      >
        <AccountForm
          mode="create"
          companyId={company.id}
          next="onboarding"
          submitLabel="Continuar"
        />
      </OnboardingShell>
    );
  }

  const company = await prisma.company.findFirst({
    where: { workspaceId: context.workspace.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <OnboardingShell
      step="pronto"
      title="Tudo pronto"
      description="Seu escritório está configurado e a primeira empresa já tem conta bancária."
    >
      <div className="space-y-5">
        <ul className="space-y-2 text-sm">
          <Done>Escritório {context.workspace.name} criado.</Done>
          <Done>Plano de contas gerencial padrão instalado.</Done>
          {company && <Done>Empresa {company.name} com conta cadastrada.</Done>}
        </ul>

        <p className="text-sm text-muted-foreground">
          O próximo passo é importar um extrato — a tela de importação chega na
          Fase 2. Por enquanto você já pode cadastrar as demais empresas e
          contas do escritório.
        </p>

        <div className="flex flex-wrap gap-2">
          <Link href="/app" className={buttonVariants()}>
            Ir para o painel
          </Link>
          {company && (
            <Link
              href={`/empresas/${company.id}`}
              className={buttonVariants({ variant: "outline" })}
            >
              Ver {company.name}
            </Link>
          )}
        </div>
      </div>
    </OnboardingShell>
  );
}

function Done({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <CheckCircle2
        className="mt-0.5 size-4 shrink-0 text-positive"
        aria-hidden="true"
      />
      <span>{children}</span>
    </li>
  );
}

function OnboardingShell({
  step,
  title,
  description,
  children,
}: {
  step: OnboardingStep;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-xl">
      <OnboardingSteps current={step} />

      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}
