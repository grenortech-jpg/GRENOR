import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Building2, FileText, Sparkles, Upload, Users } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { WaitlistForm } from "@/components/marketing/waitlist-form";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Finort · Relatórios financeiros executivos",
  description:
    "Extrato bancário em OFX, CSV ou XLSX vira DRE de caixa e relatório executivo em PDF. Feito para escritórios de contabilidade e BPOs financeiros.",
  openGraph: {
    title: "Finort · Relatórios financeiros executivos",
    description:
      "O fechamento mensal que levava 5 horas passa a levar 5 minutos.",
    images: [{ url: "/telas/fechamento.png", width: 1280, height: 800 }],
  },
};

/**
 * Pagina publica do Finort (Fase 10): proposta de valor, video, telas e a
 * lista de espera com consentimento LGPD.
 *
 * A lista de espera e a acao principal, nao o autocadastro: o modelo de
 * negocio do MVP e contrato manual com os primeiros clientes (Secao 1). O
 * /cadastro continua funcionando por acesso direto, para quem ja fechou.
 *
 * Telas e video vem da empresa de demonstracao (dados ficticios), com o
 * cabecalho da aplicacao oculto: nada de nome de escritorio ou de cliente
 * real na pagina publica.
 */
export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-6">
        <Logo />
        <nav className="flex items-center gap-2">
          <a
            href="#lista"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Lista de espera
          </a>
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

      <main className="mx-auto w-full max-w-5xl flex-1 px-6">
        {/* Proposta de valor */}
        <section className="py-12 sm:py-16">
          <p className="text-sm font-medium uppercase tracking-widest text-gold">
            Relatórios financeiros executivos
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-brand sm:text-5xl">
            O fechamento mensal que levava 5 horas passa a levar 5 minutos.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            Suba o extrato bancário em OFX, CSV ou XLSX. O Finort categoriza as
            transações, monta a DRE de caixa do período e entrega um relatório
            em PDF com a identidade visual do seu escritório.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#lista" className={buttonVariants({ size: "lg" })}>
              Entrar na lista de espera
            </a>
            <a
              href="#demo"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              Ver a demonstração
            </a>
          </div>
        </section>

        {/* Video */}
        <section id="demo" className="scroll-mt-24 py-8">
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <video
              className="aspect-video w-full bg-muted"
              controls
              muted
              playsInline
              preload="metadata"
              poster="/telas/fechamento.png"
            >
              <source src="/demo.webm" type="video/webm" />
              Seu navegador não reproduz este vídeo.{" "}
              <a href="/demo.webm">Baixe a demonstração</a>.
            </video>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Um mês de uma padaria fictícia, da conciliação ao fechamento. Sem
            narração: é a tela como ela é.
          </p>
        </section>

        {/* Como funciona */}
        <section className="py-12">
          <h2 className="text-2xl font-semibold tracking-tight">Como funciona</h2>
          <ul className="mt-8 grid gap-8 md:grid-cols-3">
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
        </section>

        {/* Telas */}
        <section className="py-12">
          <h2 className="text-2xl font-semibold tracking-tight">As telas</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Sóbrio de propósito: o produto é o relatório que sai no fim, não a
            ferramenta.
          </p>
          <div className="mt-8 grid gap-8">
            <Screen
              src="/telas/fechamento.png"
              alt="Tela de fechamento com indicadores do mês e DRE de caixa comparando com o mês anterior"
              title="Fechamento"
              caption="Indicadores do mês, DRE de caixa com comparativo e variação, gráficos e o parecer que abre o relatório."
            />
            <div className="grid gap-8 md:grid-cols-2">
              <Screen
                src="/telas/conciliacao.png"
                alt="Tela de conciliação com os lançamentos do mês, categoria de cada um e origem da categorização"
                title="Conciliação"
                caption="Cada lançamento com sua categoria e de onde ela veio: regra, sugestão ou revisão manual."
              />
              <Screen
                src="/telas/empresa.png"
                alt="Visão da empresa com contas bancárias e os meses com movimento"
                title="Empresa"
                caption="Contas, saldo inicial e o histórico de meses: aberto, em conciliação ou fechado."
              />
            </div>
          </div>
        </section>

        {/* Para quem */}
        <section className="py-12">
          <h2 className="text-2xl font-semibold tracking-tight">Para quem</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <Audience
              icon={<Building2 className="size-5" aria-hidden="true" />}
              title="Escritórios de contabilidade e BPOs financeiros"
              description="Várias empresas, vários CNPJs, um plano de contas gerencial por escritório e relatório com a sua marca para cada cliente."
            />
            <Audience
              icon={<Users className="size-5" aria-hidden="true" />}
              title="Pequenas empresas cuidando da própria gestão"
              description="Um extrato por mês, uma DRE de caixa que dá para ler, e um parecer em português claro sobre o que mudou."
            />
          </div>
        </section>

        {/* Lista de espera */}
        <section id="lista" className="scroll-mt-24 py-12">
          <div className="rounded-xl border bg-card p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-semibold tracking-tight">
              Entre na lista de espera
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Estamos atendendo os primeiros escritórios um a um, para acompanhar
              de perto cada implantação. Deixe seu contato e avisamos quando
              abrirmos uma vaga.
            </p>
            <div className="mt-6">
              <WaitlistForm />
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-6 pb-10 pt-6 text-sm text-muted-foreground">
        <span>Feito para escritórios de contabilidade e BPOs financeiros.</span>
        <span className="flex items-center gap-4">
          <Link href="/privacidade" className="underline-offset-4 hover:underline">
            Privacidade
          </Link>
          <span>Finort · by Grenor</span>
        </span>
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

function Screen({
  src,
  alt,
  title,
  caption,
}: {
  src: string;
  alt: string;
  title: string;
  caption: string;
}) {
  return (
    <figure>
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Image
          src={src}
          alt={alt}
          width={1280}
          height={800}
          sizes="(min-width: 1024px) 960px, 100vw"
          className="h-auto w-full"
        />
      </div>
      <figcaption className="mt-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{title}.</span> {caption}
      </figcaption>
    </figure>
  );
}

function Audience({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4 rounded-xl border bg-card p-5">
      <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-gold/15 text-gold">
        {icon}
      </span>
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
