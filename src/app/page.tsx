import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Pagina publica. A versao de lancamento, com lista de espera, e da Fase 8.
 */
export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <Logo />
        <nav className="flex items-center gap-2">
          {user ? (
            <Link href="/app" className={buttonVariants({ size: "sm" })}>
              Ir para o painel
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Entrar
              </Link>
              <Link href="/cadastro" className={buttonVariants({ size: "sm" })}>
                Criar conta
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-16">
        <p className="text-sm font-medium uppercase tracking-widest text-gold">
          Relatórios financeiros executivos
        </p>
        <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-brand sm:text-5xl">
          O fechamento mensal que levava 5 horas passa a levar 5 minutos.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Suba o extrato bancário em OFX, CSV ou XLSX. O Grenor categoriza as
          transações, monta a DRE de caixa do período e entrega um relatório em
          PDF com a identidade visual do seu escritório.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/cadastro" className={buttonVariants({ size: "lg" })}>
            Começar agora
          </Link>
          <Link
            href="/login"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            Já sou cliente
          </Link>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-6 pb-10 text-sm text-muted-foreground">
        Feito para escritórios de contabilidade e BPOs financeiros.
      </footer>
    </div>
  );
}
