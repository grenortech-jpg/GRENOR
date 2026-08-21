"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Erro dentro da area autenticada.
 *
 * Fica abaixo do layout, entao o cabecalho e a navegacao continuam na tela: o
 * usuario perde a secao, nao o produto inteiro.
 */
export default function AppError({
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
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-16 text-center">
      <h1 className="text-lg font-medium">Não foi possível carregar</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Os dados desta tela não vieram. Nada foi alterado — tente de novo.
      </p>

      {error.digest && (
        <p className="mt-4 font-mono text-xs text-muted-foreground">
          {error.digest}
        </p>
      )}

      <div className="mt-6">
        <Button size="sm" onClick={retry}>
          Tentar de novo
        </Button>
      </div>
    </div>
  );
}
