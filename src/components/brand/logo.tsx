import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  /** Oculta o nome, deixando apenas a marca. */
  markOnly?: boolean;
};

/**
 * Marca do Grenor: barras ascendentes em azul profundo com o topo dourado.
 * Sem gradientes, conforme a diretriz visual da Secao 9.
 */
export function Logo({ className, markOnly = false }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        viewBox="0 0 28 28"
        aria-hidden="true"
        className="size-7 shrink-0"
        fill="none"
      >
        <rect width="28" height="28" rx="6" className="fill-brand" />
        <rect x="7" y="16" width="3.5" height="6" rx="1" fill="#F7F9FC" opacity="0.55" />
        <rect x="12.25" y="12" width="3.5" height="10" rx="1" fill="#F7F9FC" opacity="0.8" />
        <rect x="17.5" y="6" width="3.5" height="16" rx="1" className="fill-gold" />
      </svg>
      {!markOnly && (
        <span className="text-lg font-semibold tracking-tight text-brand">
          Grenor
        </span>
      )}
    </span>
  );
}
