import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  /** Oculta o nome, deixando apenas a marca. */
  markOnly?: boolean;
};

/**
 * Marca do Grenor: arvore de trilhas de circuito em azul profundo, com a
 * estrela dourada no topo.
 *
 * Desenhada em SVG para escalar sem perda - a mesma marca aparece no cabecalho
 * da aplicacao e no PDF do relatorio, em tamanhos muito diferentes.
 */
export function Logo({ className, markOnly = false }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <GrenorMark className="size-7 shrink-0" />
      {!markOnly && (
        <span className="text-lg font-semibold tracking-[0.18em] text-brand">
          GRENOR
        </span>
      )}
    </span>
  );
}

export function GrenorMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      role="img"
      aria-label="Grenor"
      fill="none"
    >
      {/* Estrela de oito pontas: quatro longas nos eixos, quatro curtas nas
          diagonais. */}
      <path
        d="M100 8 L106 52 L100 62 L94 52 Z"
        className="fill-gold"
      />
      <path
        d="M100 96 L106 62 L100 52 L94 62 Z"
        className="fill-gold"
      />
      <path
        d="M42 52 L88 46 L98 52 L88 58 Z"
        className="fill-gold"
      />
      <path
        d="M158 52 L112 46 L102 52 L112 58 Z"
        className="fill-gold"
      />
      <path
        d="M100 52 L124 28 L112 46 Z M100 52 L76 28 L88 46 Z"
        className="fill-gold"
        opacity="0.9"
      />
      <path
        d="M100 52 L124 76 L112 58 Z M100 52 L76 76 L88 58 Z"
        className="fill-gold"
        opacity="0.9"
      />

      {/* Tronco: tres trilhas paralelas. A central sobe ate a estrela. */}
      <g
        className="stroke-brand"
        strokeWidth="7"
        strokeLinecap="butt"
        strokeLinejoin="miter"
      >
        <path d="M100 190 V 88" />
        <path d="M84 190 V 132" />
        <path d="M116 190 V 132" />

        {/* Ramos da esquerda: saem do tronco, viram e sobem, como trilha de
            placa de circuito. */}
        <path d="M84 150 H 62 V 108" />
        <path d="M84 132 H 44 V 128" />
        <path d="M100 122 H 68 V 88" />
        <path d="M100 104 H 84 V 74" />

        {/* Ramos da direita, espelhados. */}
        <path d="M116 150 H 138 V 108" />
        <path d="M116 132 H 156 V 128" />
        <path d="M100 122 H 132 V 88" />
        <path d="M100 104 H 116 V 74" />
      </g>
    </svg>
  );
}
