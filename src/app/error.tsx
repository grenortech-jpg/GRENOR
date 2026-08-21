"use client";

import { useEffect } from "react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

/**
 * Fronteira de erro da raiz.
 *
 * Nao mostra `error.message`: a mensagem pode carregar detalhe de banco ou de
 * infraestrutura, e esta pagina e publica. O `digest` e o identificador que a
 * Vercel grava no log do servidor - e o que permite achar o erro real a partir
 * do que o usuario relata.
 */
export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-6 py-16 text-center">
      <Logo />

      <h1 className="mt-10 text-2xl font-semibold tracking-tight">
        Algo deu errado
      </h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        Não foi possível carregar esta página. Tente de novo; se continuar,
        avise o suporte informando o código abaixo.
      </p>

      {error.digest && (
        <p className="mt-4 rounded-md bg-muted px-3 py-1.5 font-mono text-xs text-muted-foreground">
          {error.digest}
        </p>
      )}

      <div className="mt-8">
        <Button onClick={retry}>Tentar de novo</Button>
      </div>
    </div>
  );
}
