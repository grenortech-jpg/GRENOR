import { Skeleton } from "@/components/ui/skeleton";

/**
 * Estado de carregamento da area autenticada.
 *
 * Vale para todas as telas abaixo de (app) que nao definirem o proprio. O
 * esqueleto imita o formato comum - titulo, faixa de cartoes e um bloco de
 * conteudo - em vez de um spinner centralizado, que faz a pagina "pular"
 * quando o conteudo real chega.
 */
export default function AppLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>

      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>

      <Skeleton className="h-64" />
    </div>
  );
}
