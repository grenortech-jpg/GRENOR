import { Skeleton } from "@/components/ui/skeleton";

/**
 * Carregamento do fechamento.
 *
 * A tela mais pesada do produto: calcula a DRE, o comparativo com o mes
 * anterior e tres graficos. Ganha esqueleto proprio porque o generico de
 * (app) nao lembra em nada o que vai aparecer aqui.
 */
export default function ClosingLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando o relatório…</span>

      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-72" />
      </div>

      <Skeleton className="h-32" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>

      <Skeleton className="h-96" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}
