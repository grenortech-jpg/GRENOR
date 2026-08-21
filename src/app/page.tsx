import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Sparkles, Upload } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { WaitlistForm } from "@/components/marketing/waitlist-form";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Grenor · Relatórios financeiros executivos",
  description:
    "Extrato bancário em OFX, CSV ou XLSX vira DRE de caixa e relatório executivo em PDF. Feito para escritórios de contabilidade e BPOs financeiros.",
};

/**
 * Pagina publica de lancamento (Fase 8).
 *
 * A lista de espera e a acao principal, nao o autocadastro: o modelo de
 * negocio do MVP e contrato manual com os primeiros clientes (Secao 1). O
 * /cadastro continua funcionando por acesso direto, para quem ja fechou -
 * fechar a porta exigiria um fluxo de convite que nao existe.
 */
export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-6">
        <Logo />
        <nav className="flex items-center gap-2">
          {user ? (
            <Link href="/app" className={buttonVariants({ size: "sm" })}>
              Ir para o painel
            </Link>
          ) : (
            <Link
              href="/login"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Já sou cliente
            </Link>
          )}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12 sm:py-16">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-start lg:gap-16">
          <div>
            <p className="text-sm font-medium uppercase tracking-widest text-gold">
              Relatórios financeiros executivos
            </p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight text-brand sm:text-5xl">
              O fechamento mensal que levava 5 horas passa a levar 5 minutos.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              Suba o extrato bancário em OFX, CSV ou XLSX. O Grenor categoriza as
              transações, monta a DRE de caixa do período e entrega um relatório
              em PDF com a identidade visual do seu escritório.
            </p>

            <ul className="mt-10 space-y-5">
              <Step
                icon={<Upload className="size-5" aria-hidden="true" />}
                title="Suba o extrato"
                description="OFX, CSV ou XLSX de qualquer banco brasileiro. Reimportar o mesmo arquivo nunca duplica lançamento."
              />
              <Step
                icon={<Sparkles className="size-5" aria-hidden="true" />}
                title="Confira a categorização"
                description="Regras do seu escritório resolvem o repetitivo. O que sobra você revisa em uma tela, e a correção vira regra."
              />
              <Step
                icon={<FileText className="size-5" aria-hidden="true" />}
                title="Entregue o relatório"
                description="DRE de caixa, indicadores, gráficos e parecer executivo em PDF, ou por link para o seu cliente abrir no navegador."
              />
            </ul>
          </div>

          <div className="rounded-xl border bg-card p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-semibold tracking-tight">
              Entre na lista de espera
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Estamos atendendo os primeiros escritórios um a um, para acompanhar
              de perto cada implantação. Deixe seu contato e avisamos quando
              abrirmos uma vaga.
            </p>

            <div className="mt-6">
              <WaitlistForm />
            </div>
          </div>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-6 pb-10 text-sm text-muted-foreground">
        Feito para escritórios de contabilidade e BPOs financeiros.
      </footer>
    </div>
  );
}

function Step({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <li className="flex gap-4">
      <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
        {icon}
      </span>
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </li>
  );
}
