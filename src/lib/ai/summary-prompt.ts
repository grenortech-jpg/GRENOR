import { formatAmount } from "@/lib/format";
import type { YearMonth } from "@/lib/period";
import type { PeriodReport } from "@/lib/reports/load";

/**
 * Prompt do parecer executivo (Secao 8.2 do CLAUDE.md).
 *
 * Diferente da categorizacao (Secao 8.1), aqui a saida e texto corrido, nao
 * JSON: o parecer vai direto para a capa do relatorio que o escritorio entrega
 * ao cliente. Por isso o system prompt gasta linhas proibindo emoji, lista e
 * jargao - o que sai daqui e lido por um dono de empresa, nao por um sistema.
 */

export const SUMMARY_SYSTEM_PROMPT = `Voce e um analista financeiro senior escrevendo para donos de pequenas
empresas brasileiras. Tom executivo, direto, sem jargao tecnico, sem
emojis, sem listas: apenas paragrafos corridos em portugues do Brasil.
Nunca invente numeros: use somente os dados fornecidos.`;

/** Limite da Secao 5.6: no maximo 3 geracoes por IA em cada periodo. */
export const MAX_SUMMARY_GENERATIONS = 3;

/** Teto de caracteres do parecer, com folga sobre as 300 palavras da Secao 8.2. */
export const MAX_SUMMARY_LENGTH = 5_000;

/**
 * Dinheiro para o prompt: string em BRL com sinal explicito.
 *
 * O sinal e o que separa uma entrada de uma saida com a mesma descricao, e
 * mandar centavos crus faria o modelo errar a ordem de grandeza por 100x.
 * Mesmo caminho de formatacao usado na Secao 8.1.
 */
function money(cents: number): string {
  return `${cents < 0 ? "-" : ""}${formatAmount(Math.abs(cents))}`;
}

type GroupPayload = {
  grupo: string;
  valor: string;
  variacaoPct: number | null;
  /** Transferencias entre contas ficam fora dos totais (Secao 6, item 11). */
  neutro: boolean;
};

export type SummaryPayload = {
  competencia: string;
  indicadores: {
    entradas: string;
    saidas: string;
    resultadoOperacional: string;
    geracaoLiquidaDeCaixa: string;
    margemOperacionalPct: number | null;
    saldoConsolidadoFimDoMes: string;
  };
  grupos: GroupPayload[];
  resultadoOperacional: string;
  geracaoLiquidaDeCaixa: string;
  maioresCategoriasDeDespesa: { categoria: string; valor: string }[];
  maioresSaidas: { data: string; descricao: string; categoria: string; valor: string }[];
  maioresEntradas: { data: string; descricao: string; categoria: string; valor: string }[];
};

/** Recorte do mes anterior: so o que a DRE ja carrega como comparativo. */
export type PriorPayload = {
  grupos: { grupo: string; valor: string; neutro: boolean }[];
  resultadoOperacional: string;
  geracaoLiquidaDeCaixa: string;
};

/**
 * Projeta o snapshot no recorte que vai para o modelo.
 *
 * O snapshot completo carrega series de saldo dia a dia e fluxo de seis meses -
 * volume que so encareceria a chamada sem mudar o parecer. Fica o que sustenta
 * os quatro pontos pedidos pela Secao 8.2: totais, grupos, variacoes e os
 * lancamentos grandes o bastante para explicar uma variacao.
 */
export function toSummaryPayload(
  report: PeriodReport,
  month: YearMonth,
): SummaryPayload {
  const { dre } = report;

  return {
    competencia: `${String(month.month).padStart(2, "0")}/${month.year}`,
    indicadores: {
      entradas: money(dre.indicators.inflowCents),
      saidas: money(dre.indicators.outflowCents),
      resultadoOperacional: money(dre.indicators.operatingResultCents),
      geracaoLiquidaDeCaixa: money(dre.indicators.netCashCents),
      margemOperacionalPct: round(dre.indicators.marginPct),
      saldoConsolidadoFimDoMes: money(dre.indicators.closingBalanceCents),
    },
    grupos: dre.groups.map((group) => ({
      grupo: group.label,
      valor: money(group.currentCents),
      variacaoPct: round(group.variationPct),
      neutro: group.neutral,
    })),
    resultadoOperacional: money(dre.operatingResult.currentCents),
    geracaoLiquidaDeCaixa: money(dre.netCash.currentCents),
    maioresCategoriasDeDespesa: report.topExpenses.map((expense) => ({
      categoria: expense.name,
      valor: money(expense.cents),
    })),
    maioresSaidas: report.biggestOutflows.map(transaction),
    maioresEntradas: report.biggestInflows.map(transaction),
  };
}

/**
 * Projeta o mes anterior.
 *
 * A Secao 8.2 pede "dados do periodo anterior (JSON ou null)", mas nao e
 * preciso carregar o mes anterior de novo: cada linha e cada grupo da DRE ja
 * carrega previousCents, calculado no mesmo passe. Devolve null quando o mes
 * anterior nao teve movimento algum - dizer "null" e mais honesto do que
 * mandar uma coluna de zeros, que o modelo leria como queda de 100%.
 */
export function toPriorPayload(report: PeriodReport): PriorPayload | null {
  const { dre } = report;

  const hadMovement =
    dre.groups.some((group) => group.previousCents !== 0) ||
    dre.operatingResult.previousCents !== 0 ||
    dre.netCash.previousCents !== 0;

  if (!hadMovement) return null;

  return {
    grupos: dre.groups.map((group) => ({
      grupo: group.label,
      valor: money(group.previousCents),
      neutro: group.neutral,
    })),
    resultadoOperacional: money(dre.operatingResult.previousCents),
    geracaoLiquidaDeCaixa: money(dre.netCash.previousCents),
  };
}

function transaction(row: {
  date: string;
  description: string;
  categoryName: string | null;
  amountCents: number;
}) {
  return {
    data: row.date,
    descricao: row.description,
    categoria: row.categoryName ?? "sem categoria",
    valor: money(row.amountCents),
  };
}

/** Percentual com uma casa; null continua null (Secao 5, variacao contra zero). */
function round(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}

/** Mensagem do usuario, conforme o template da Secao 8.2. */
export function buildSummaryPrompt(params: {
  company: string;
  payload: SummaryPayload;
  prior: PriorPayload | null;
}): string {
  return `Empresa: ${params.company}
Valores em BRL. Sinal negativo indica saida de caixa.

Dados do periodo (JSON): ${JSON.stringify(params.payload)}
Dados do periodo anterior (JSON ou null): ${JSON.stringify(params.prior)}

Escreva o sumario executivo do relatorio mensal em 3 a 5 paragrafos:
1) resultado geral do mes; 2) principais variacoes vs. mes anterior e
seus provaveis motivos com base nas categorias; 3) pontos de atencao;
4) uma recomendacao pratica. Maximo 300 palavras.`;
}
