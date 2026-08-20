import {
  ArrowDownLeft,
  ArrowUpRight,
  Percent,
  PiggyBank,
  TrendingUp,
  Wallet,
} from "lucide-react";

import type { DreIndicators } from "@/lib/reports/dre";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Cards do mes (Secao 7, item 3). */
export function Indicators({ indicators }: { indicators: DreIndicators }) {
  const cards = [
    {
      label: "Entradas totais",
      value: formatMoney(indicators.inflowCents),
      icon: ArrowUpRight,
      tone: "positive" as const,
    },
    {
      label: "Saídas totais",
      value: formatMoney(Math.abs(indicators.outflowCents)),
      icon: ArrowDownLeft,
      tone: "negative" as const,
    },
    {
      label: "Resultado operacional",
      value: formatMoney(indicators.operatingResultCents),
      icon: TrendingUp,
      tone: indicators.operatingResultCents >= 0 ? "positive" : "negative",
    },
    {
      label: "Geração líquida de caixa",
      value: formatMoney(indicators.netCashCents),
      icon: PiggyBank,
      tone: indicators.netCashCents >= 0 ? "positive" : "negative",
    },
    {
      label: "Margem operacional",
      value:
        indicators.marginPct === null
          ? "—"
          : `${indicators.marginPct.toFixed(1).replace(".", ",")}%`,
      icon: Percent,
      tone: (indicators.marginPct ?? 0) >= 0 ? "positive" : "negative",
      hint: indicators.marginPct === null ? "sem receita no período" : undefined,
    },
    {
      label: "Saldo consolidado",
      value: formatMoney(indicators.closingBalanceCents),
      icon: Wallet,
      tone: "neutral" as const,
      hint: "todas as contas, ao fim do mês",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <card.icon className="size-3.5" aria-hidden="true" />
            {card.label}
          </div>
          <p
            className={cn(
              "mt-2 text-xl font-semibold tabular",
              card.tone === "positive" && "text-positive",
              card.tone === "negative" && "text-negative",
            )}
          >
            {card.value}
          </p>
          {card.hint && (
            <p className="mt-0.5 text-xs text-muted-foreground">{card.hint}</p>
          )}
        </div>
      ))}
    </div>
  );
}
