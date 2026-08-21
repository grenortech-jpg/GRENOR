import { formatAmount, formatMoney, formatMonth, formatCnpj } from "@/lib/format";
import type { PeriodReport } from "@/lib/reports/load";
import {
  balanceSvg,
  monthlyFlowSvg,
  topExpensesSvg,
} from "@/lib/reports/svg-charts";

/**
 * O relatorio executivo (Secao 7), como HTML.
 *
 * Gerado por template de string, e nao por componente React, por dois motivos:
 *
 *  - O Next bloqueia `react-dom/server` no App Router, entao nao ha como
 *    transformar um componente em HTML para alimentar o gerador de PDF.
 *  - Com uma unica funcao, o PDF e o link publico saem do mesmo lugar. Nao
 *    existe a possibilidade de os dois divergirem.
 *
 * Estilo inline de proposito: o PDF nasce de um HTML solto, sem a folha de
 * estilos da aplicacao.
 */

const BRAND = "#1b2a4a";
const GOLD = "#c9a227";
const INK = "#2e3440";
const MUTED = "#6b7280";
const LINE = "#e3e8ef";
const POSITIVE = "#1f7a4d";
const NEGATIVE = "#b3261e";

export type ReportData = {
  company: { name: string; cnpj: string | null; logoUrl: string | null };
  workspace: { name: string; logoUrl: string | null };
  month: { year: number; month: number };
  report: PeriodReport;
  summary: string | null;
  generatedAt: Date;
};

/** Escapa qualquer texto que venha do banco antes de entrar no HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function money(cents: number, signed = false): string {
  if (cents === 0) return "—";
  return `${signed && cents < 0 ? "−" : ""}${formatAmount(Math.abs(cents))}`;
}

function percent(value: number | null): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1).replace(".", ",")}%`;
}


/**
 * Grupos cujo rotulo ja carrega o "(-)" aparecem em modulo, como o contador
 * le. Os demais precisam do sinal: "Movimentacoes societarias 1.983,04" sem
 * sinal e lido como entrada, quando o grupo foi saida liquida de 1.983,04.
 */
const MODULE_GROUPS = new Set([
  "SALES_TAXES",
  "VARIABLE_COSTS",
  "PERSONNEL",
  "OPERATING_EXPENSES",
  "FINANCIAL_EXPENSES",
]);

const CELL = `padding:4px 8px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap`;

export function renderReportHtml(data: ReportData): string {
  const monthLabel = formatMonth(data.month.year, data.month.month);
  const previousLabel = formatMonth(
    data.month.month === 1 ? data.month.year - 1 : data.month.year,
    data.month.month === 1 ? 12 : data.month.month - 1,
  );

  return `<div style="font-family:Inter,system-ui,-apple-system,sans-serif;color:${INK};font-size:12px;line-height:1.5;max-width:760px;margin:0 auto;padding:32px 28px">
${cover(data, monthLabel)}
${data.summary ? section("Sumário executivo", summaryHtml(data.summary)) : ""}
${section("Indicadores do mês", indicators(data.report))}
${section("DRE de caixa", dreTable(data.report, monthLabel, previousLabel), true)}
${section("Entradas e saídas · últimos 6 meses", monthlyFlowSvg(data.report.monthlyFlow), true)}
${
  data.report.topExpenses.length > 0
    ? section(
        "Maiores categorias de despesa",
        topExpensesSvg(data.report.topExpenses),
      )
    : ""
}
${section("Evolução do saldo no mês", balanceSvg(data.report.balanceSeries))}
${section("Maiores lançamentos", biggestTransactions(data.report), true)}
${footer(data.generatedAt)}
</div>`;
}

function cover(data: ReportData, monthLabel: string): string {
  // Logo da empresa quando existir; senao a do escritorio (Secao 7).
  const logo = data.company.logoUrl ?? data.workspace.logoUrl;

  const mark = logo
    ? `<img src="${escapeHtml(logo)}" alt="" style="max-height:48px;max-width:180px;margin-bottom:16px" />`
    : `<div style="margin-bottom:16px">${grenorMark()}</div>`;

  return `<header style="margin-bottom:28px">
${mark}
<p style="margin:0;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${GOLD}">Relatório financeiro executivo</p>
<h1 style="margin:6px 0 2px;font-size:26px;font-weight:600;color:${BRAND};letter-spacing:-0.01em">${escapeHtml(data.company.name)}</h1>
<p style="margin:0;color:${MUTED}">${data.company.cnpj ? `${formatCnpj(data.company.cnpj)} · ` : ""}${monthLabel}</p>
<p style="margin:2px 0 0;font-size:11px;color:${MUTED}">${escapeHtml(data.workspace.name)}</p>
</header>`;
}

function grenorMark(): string {
  return `<svg viewBox="0 0 200 200" width="40" height="40" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
<path d="M100 8 L106 52 L100 62 L94 52 Z" fill="${GOLD}" />
<path d="M100 96 L106 62 L100 52 L94 62 Z" fill="${GOLD}" />
<path d="M42 52 L88 46 L98 52 L88 58 Z" fill="${GOLD}" />
<path d="M158 52 L112 46 L102 52 L112 58 Z" fill="${GOLD}" />
<g stroke="${BRAND}" stroke-width="7" fill="none">
<path d="M100 190 V 88" /><path d="M84 190 V 132" /><path d="M116 190 V 132" />
<path d="M84 150 H 62 V 108" /><path d="M116 150 H 138 V 108" />
<path d="M100 122 H 68 V 88" /><path d="M100 122 H 132 V 88" />
</g></svg>`;
}

function section(title: string, body: string, breakBefore = false): string {
  if (!body) return "";

  return `<section style="margin-bottom:24px;break-inside:avoid${
    breakBefore ? ";break-before:page" : ""
  }">
<h2 style="margin:0 0 10px;font-size:13px;font-weight:600;color:${BRAND};padding-bottom:4px;border-bottom:1px solid ${LINE}">${escapeHtml(title)}</h2>
${body}
</section>`;
}

function summaryHtml(summary: string): string {
  return summary
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 10px">${escapeHtml(paragraph.trim())}</p>`)
    .join("");
}

function indicators(report: PeriodReport): string {
  const { indicators: values } = report.dre;

  const cards: { label: string; value: string; tone?: "pos" | "neg" }[] = [
    { label: "Entradas totais", value: formatMoney(values.inflowCents) },
    {
      label: "Saídas totais",
      value: formatMoney(Math.abs(values.outflowCents)),
    },
    {
      label: "Resultado operacional",
      value: formatMoney(values.operatingResultCents),
      tone: values.operatingResultCents >= 0 ? "pos" : "neg",
    },
    {
      label: "Geração líquida de caixa",
      value: formatMoney(values.netCashCents),
      tone: values.netCashCents >= 0 ? "pos" : "neg",
    },
    {
      label: "Margem operacional",
      value:
        values.marginPct === null
          ? "—"
          : `${values.marginPct.toFixed(1).replace(".", ",")}%`,
      tone: (values.marginPct ?? 0) >= 0 ? "pos" : "neg",
    },
    {
      label: "Saldo consolidado",
      value: formatMoney(values.closingBalanceCents),
    },
  ];

  const boxes = cards
    .map((card) => {
      const color =
        card.tone === "pos" ? POSITIVE : card.tone === "neg" ? NEGATIVE : INK;

      return `<div style="flex:1 1 30%;min-width:160px;border:1px solid ${LINE};border-radius:6px;padding:10px 12px">
<p style="margin:0;font-size:10px;color:${MUTED}">${escapeHtml(card.label)}</p>
<p style="margin:4px 0 0;font-size:16px;font-weight:600;font-variant-numeric:tabular-nums;color:${color}">${card.value}</p>
</div>`;
    })
    .join("");

  return `<div style="display:flex;flex-wrap:wrap;gap:10px">${boxes}</div>`;
}

function dreTable(
  report: PeriodReport,
  monthLabel: string,
  previousLabel: string,
): string {
  const rows: string[] = [];

  for (const group of report.dre.groups) {
    const hasMovement =
      group.currentCents !== 0 ||
      group.previousCents !== 0 ||
      group.lines.some((l) => l.currentCents !== 0 || l.previousCents !== 0);

    const signed = !MODULE_GROUPS.has(group.group);

    if (hasMovement) {
      rows.push(`<tr style="background:#f4f6f9">
<th style="${CELL};text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.04em">${escapeHtml(group.label)}${
        group.neutral
          ? `<span style="color:${MUTED};text-transform:none"> (fora dos totais)</span>`
          : ""
      }</th>
<td style="${CELL};font-weight:600">${money(group.currentCents, signed)}</td>
<td style="${CELL};color:${MUTED}">${money(group.previousCents, signed)}</td>
<td style="${CELL}">${percent(group.variationPct)}</td>
</tr>`);

      for (const line of group.lines) {
        if (line.currentCents === 0 && line.previousCents === 0) continue;
        rows.push(`<tr style="border-top:1px solid ${LINE}">
<td style="${CELL};text-align:left;padding-left:20px;color:${MUTED}">${escapeHtml(line.name)}</td>
<td style="${CELL}">${money(line.currentCents, signed)}</td>
<td style="${CELL};color:${MUTED}">${money(line.previousCents, signed)}</td>
<td style="${CELL}">${percent(line.variationPct)}</td>
</tr>`);
      }
    }

    if (group.group === "FINANCIAL_EXPENSES") {
      rows.push(totalRow(report.dre.operatingResult));
    }
    if (group.group === "EQUITY_AND_LOANS") {
      rows.push(totalRow(report.dre.netCash));
    }
  }

  // As celulas numericas usam white-space:nowrap, entao a tabela tem largura
  // minima propria. No PDF (760px) sobra espaco; num celular, sem este
  // contentor a tabela empurraria a pagina inteira para o lado.
  return `<div style="overflow-x:auto">
<table style="width:100%;border-collapse:collapse;font-size:11px">
<thead><tr style="border-bottom:1px solid ${LINE}">
<th style="${CELL};text-align:left;font-size:10px;color:${MUTED}">Conta</th>
<th style="${CELL};font-size:10px;color:${MUTED}">${monthLabel}</th>
<th style="${CELL};font-size:10px;color:${MUTED}">${previousLabel}</th>
<th style="${CELL};font-size:10px;color:${MUTED}">Variação</th>
</tr></thead>
<tbody>${rows.join("")}</tbody>
</table>
</div>`;
}

function totalRow(total: PeriodReport["dre"]["operatingResult"]): string {
  const cell = `padding:6px 8px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap`;
  const color = total.currentCents < 0 ? NEGATIVE : POSITIVE;

  return `<tr style="background:#eef2f8;border-top:2px solid ${BRAND}33">
<th style="${cell};text-align:left">${escapeHtml(total.label)}</th>
<td style="${cell};color:${color}">${money(total.currentCents, true)}</td>
<td style="${cell};color:${MUTED}">${money(total.previousCents, true)}</td>
<td style="${cell}">${percent(total.variationPct)}</td>
</tr>`;
}

function biggestTransactions(report: PeriodReport): string {
  const table = (title: string, rows: PeriodReport["biggestOutflows"]) => {
    if (rows.length === 0) return "";

    const body = rows
      .map(
        (row) => `<tr style="border-top:1px solid ${LINE}">
<td style="padding:3px 4px;color:${MUTED};white-space:nowrap">${row.date.split("-").reverse().join("/")}</td>
<td style="padding:3px 4px">${escapeHtml(
          row.description.length > 34
            ? `${row.description.slice(0, 33)}…`
            : row.description,
        )}<br /><span style="color:${MUTED};font-size:9px">${escapeHtml(row.categoryName ?? "sem categoria")}</span></td>
<td style="padding:3px 4px;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;color:${
          row.amountCents < 0 ? NEGATIVE : POSITIVE
        }">${row.amountCents < 0 ? "−" : "+"}${formatAmount(Math.abs(row.amountCents))}</td>
</tr>`,
      )
      .join("");

    // flex-basis de 260px com wrap: cabem lado a lado na largura do PDF e
    // empilham sozinhos num celular, sem media query.
    return `<div style="flex:1 1 260px;min-width:0">
<p style="margin:0 0 6px;font-size:11px;font-weight:600">${escapeHtml(title)}</p>
<table style="width:100%;border-collapse:collapse;font-size:10px"><tbody>${body}</tbody></table>
</div>`;
  };

  return `<div style="display:flex;flex-wrap:wrap;gap:20px">${table("Saídas", report.biggestOutflows)}${table("Entradas", report.biggestInflows)}</div>`;
}

function footer(generatedAt: Date): string {
  const date = generatedAt.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });

  return `<footer style="margin-top:28px;padding-top:12px;border-top:1px solid ${LINE};font-size:10px;color:${MUTED};display:flex;justify-content:space-between">
<span>Gerado por Grenor</span><span>${date}</span>
</footer>`;
}
