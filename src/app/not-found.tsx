import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";

/**
 * 404 publica.
 *
 * Alcancada tambem por link de relatorio invalido ou desativado, entao o texto
 * evita afirmar que a pagina "nao existe": pode existir e ter sido desligada
 * pelo escritorio, e o leitor e o cliente dele.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-6 py-16 text-center">
      <Logo />

      <h1 className="mt-10 text-2xl font-semibold tracking-tight">
        Página não encontrada
      </h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        O endereço não existe ou o acesso foi desativado por quem o
        compartilhou. Confira o link ou peça um novo.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className={buttonVariants()}>
          Ir para o início
        </Link>
        <Link href="/app" className={buttonVariants({ variant: "outline" })}>
          Meu painel
        </Link>
      </div>
    </div>
  );
}
