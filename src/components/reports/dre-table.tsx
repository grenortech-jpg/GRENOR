import type { DreGroup, DreReport, DreTotal } from "@/lib/reports/dre";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * DRE de caixa (Secao 7, item 4): mes atual, mes anterior e variacao.
 *
 * Valores de despesa aparecem em modulo, porque o rotulo do grupo ja carrega o
 * "(-)" - e como o contador le. O sinal continua correto por baixo, nos totais.
 *
 * As linhas calculadas (itens 7 e 10 da Secao 6) entram no meio da tabela,
 * logo depois dos grupos que as compoem, e por isso a montagem acontece numa
 * lista unica de linhas em vez de um map por grupo.
 */

type Row =
  | { kind: "group"; group: DreGroup }
  | { kind: "total"; total: DreTotal };

function buildRows(report: DreReport): Row[] {
  const rows: Row[] = [];

  for (const group of report.groups) {
    const hasMovement =
      group.currentCents !== 0 ||
      group.previousCents !== 0 ||
      group.lines.some(
        (line) => line.currentCents !== 0 || line.previousCents !== 0,
      );

    // Grupo sem nenhum movimento nos dois meses vira ruido na tabela.
    if (hasMovement) rows.push({ kind: "group", group });

    // Item 7 fecha os grupos 1 a 6; item 10 fecha os grupos 8 e 9.
    if (group.group === "FINANCIAL_EXPENSES") {
      rows.push({ kind: "total", total: report.operatingResult });
    }
    if (group.group === "EQUITY_AND_LOANS") {
      rows.push({ kind: "total", total: report.netCash });
    }
  }

  return rows;
}

export function DreTable({
  report,
  currentLabel,
  previousLabel,
}: {
  report: DreReport;
  currentLabel: string;
  previousLabel: string;
}) {
  const rows = buildRows(report);

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left font-medium">Conta</th>
            <th className="px-4 py-2 text-right font-medium">{currentLabel}</th>
            <th className="px-4 py-2 text-right font-medium">{previousLabel}</th>
            <th className="px-4 py-2 text-right font-medium">Variação</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row, index) =>
            row.kind === "total" ? (
              <TotalRow key={`total-${row.total.key}`} total={row.total} />
            ) : (
              <GroupBlock key={`group-${row.group.group}-${index}`} group={row.group} />
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function GroupBlock({ group }: { group: DreGroup }) {
  return (
    <>
      <tr className="border-t bg-muted/30">
        <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide">
          {group.label}
          {group.neutral && (
            <span className="ml-2 font-normal normal-case text-muted-foreground">
              (fora dos totais)
            </span>
          )}
        </th>
        <Amount cents={group.currentCents} bold />
        <Amount cents={group.previousCents} bold muted />
        <Variation value={group.variationPct} />
      </tr>

      {group.lines
        .filter((line) => line.currentCents !== 0 || line.previousCents !== 0)
        .map((line) => (
          <tr key={line.categoryId} className="border-t">
            <td className="px-4 py-1.5 pl-8 text-muted-foreground">{line.name}</td>
            <Amount cents={line.currentCents} />
            <Amount cents={line.previousCents} muted />
            <Variation value={line.variationPct} />
          </tr>
        ))}
    </>
  );
}

function TotalRow({ total }: { total: DreTotal }) {
  return (
    <tr className="border-t-2 border-brand/30 bg-accent/40">
      <th className="px-4 py-2.5 text-left font-semibold">{total.label}</th>
      <Amount cents={total.currentCents} bold signed />
      <Amount cents={total.previousCents} bold muted signed />
      <Variation value={total.variationPct} />
    </tr>
  );
}

function Amount({
  cents,
  bold,
  muted,
  signed,
}: {
  cents: number;
  bold?: boolean;
  muted?: boolean;
  signed?: boolean;
}) {
  return (
    <td
      className={cn(
        "whitespace-nowrap px-4 py-1.5 text-right tabular",
        bold && "font-medium",
        muted && "text-muted-foreground",
        signed && cents < 0 && "text-negative",
        signed && cents > 0 && "text-positive",
      )}
    >
      {cents === 0 ? "—" : `${signed && cents < 0 ? "−" : ""}${formatAmount(Math.abs(cents))}`}
    </td>
  );
}

function Variation({ value }: { value: number | null }) {
  if (value === null) {
    return <td className="px-4 py-1.5 text-right text-muted-foreground">—</td>;
  }

  return (
    <td
      className={cn(
        "whitespace-nowrap px-4 py-1.5 text-right tabular",
        value > 0 ? "text-positive" : value < 0 ? "text-negative" : "",
      )}
    >
      {value > 0 ? "+" : ""}
      {value.toFixed(1).replace(".", ",")}%
    </td>
  );
}
