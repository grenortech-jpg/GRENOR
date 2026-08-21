import { describe, expect, it } from "vitest";

import { balanceSvg, monthlyFlowSvg, topExpensesSvg } from "@/lib/reports/svg-charts";
import { escapeHtml, renderReportHtml, type ReportData } from "@/lib/reports/report-html";
import type { PeriodReport } from "@/lib/reports/load";

/**
 * O HTML do relatorio e o produto entregue ao cliente do escritorio: sai como
 * PDF e como link publico. Testar a string gerada pega os erros que so
 * apareceriam abrindo o arquivo.
 */

const emptyGroup = (group: string, label: string, cents: number) => ({
  group: group as never,
  label,
  lines: [
    {
      categoryId: `${group}-1`,
      name: `Conta ${group}`,
      currentCents: cents,
      previousCents: 0,
      variationPct: null,
    },
  ],
  currentCents: cents,
  previousCents: 0,
  variationPct: null,
  neutral: group === "TRANSFERS",
});

const report: PeriodReport = {
  dre: {
    groups: [
      emptyGroup("REVENUE", "Receitas", 25_000_00),
      emptyGroup("SALES_TAXES", "(-) Impostos sobre vendas", -1_500_00),
      emptyGroup("VARIABLE_COSTS", "(-) Custos variáveis", 0),
      emptyGroup("PERSONNEL", "(-) Despesas com pessoal", -6_000_00),
      emptyGroup("OPERATING_EXPENSES", "(-) Despesas operacionais", -2_500_00),
      emptyGroup("FINANCIAL_EXPENSES", "(-) Despesas financeiras", -100_00),
      emptyGroup("INVESTMENTS", "Investimentos", 0),
      emptyGroup("EQUITY_AND_LOANS", "Movimentações societárias", 0),
      emptyGroup("TRANSFERS", "Transferências entre contas", 0),
    ],
    operatingResult: {
      key: "OPERATING_RESULT",
      label: "Resultado operacional de caixa",
      currentCents: 14_900_00,
      previousCents: 12_000_00,
      variationPct: 24.17,
    },
    netCash: {
      key: "NET_CASH",
      label: "Geração líquida de caixa",
      currentCents: 14_900_00,
      previousCents: 12_000_00,
      variationPct: 24.17,
    },
    indicators: {
      inflowCents: 25_000_00,
      outflowCents: -10_100_00,
      operatingResultCents: 14_900_00,
      netCashCents: 14_900_00,
      marginPct: 59.6,
      closingBalanceCents: 64_900_00,
    },
    uncategorizedCount: 0,
  },
  topExpenses: [{ name: "Salários", cents: 6_000_00 }],
  balanceSeries: [
    { date: "2026-08-01", balanceCents: 50_000_00 },
    { date: "2026-08-02", balanceCents: 52_000_00 },
    { date: "2026-08-03", balanceCents: 64_900_00 },
  ],
  monthlyFlow: [
    { year: 2026, month: 7, inflowCents: 20_000_00, outflowCents: 8_000_00 },
    { year: 2026, month: 8, inflowCents: 25_000_00, outflowCents: 10_100_00 },
  ],
  biggestOutflows: [
    {
      date: "2026-08-05",
      description: "PAGAMENTO ALUGUEL",
      categoryName: "Aluguel",
      amountCents: -2_500_00,
    },
  ],
  biggestInflows: [
    {
      date: "2026-08-03",
      description: "PIX RECEBIDO JOSÉ ANTÔNIO",
      categoryName: "Receita de vendas",
      amountCents: 3_450_00,
    },
  ],
  transactionsBeforeOpening: 0,
};

const data: ReportData = {
  company: { name: "Padaria São João", cnpj: "11222333000181", logoUrl: null },
  workspace: { name: "Contabilidade Silva", logoUrl: null },
  month: { year: 2026, month: 8 },
  report,
  summary: null,
  generatedAt: new Date(Date.UTC(2026, 8, 1, 12)),
};

const html = renderReportHtml(data);

describe("capa", () => {
  it("traz empresa, CNPJ formatado, mes e escritorio", () => {
    expect(html).toContain("Padaria São João");
    expect(html).toContain("11.222.333/0001-81");
    expect(html).toContain("agosto de 2026");
    expect(html).toContain("Contabilidade Silva");
  });

  it("anuncia o tipo de documento", () => {
    expect(html).toContain("Relatório financeiro executivo");
  });

  it("usa a marca do Grenor quando nao ha logo", () => {
    expect(html).toContain("<svg");
  });

  it("usa o logo da empresa quando existe", () => {
    const comLogo = renderReportHtml({
      ...data,
      company: { ...data.company, logoUrl: "https://exemplo.com/logo.png" },
    });

    expect(comLogo).toContain('src="https://exemplo.com/logo.png"');
  });
});

describe("indicadores", () => {
  it("traz os seis cards da Secao 7", () => {
    for (const label of [
      "Entradas totais",
      "Saídas totais",
      "Resultado operacional",
      "Geração líquida de caixa",
      "Margem operacional",
      "Saldo consolidado",
    ]) {
      expect(html).toContain(label);
    }
  });

  it("exibe saida em modulo, nao negativa", () => {
    // O rotulo ja diz "Saidas": repetir o sinal confunde.
    expect(html).toContain("10.100,00");
    expect(html).not.toContain("-R$ 10.100,00");
  });

  it("formata a margem em pt-BR", () => {
    expect(html).toContain("59,6%");
  });
});

describe("DRE", () => {
  it("traz as duas linhas calculadas da Secao 6", () => {
    expect(html).toContain("Resultado operacional de caixa");
    expect(html).toContain("Geração líquida de caixa");
  });

  it("omite grupo sem movimento nos dois meses", () => {
    expect(html).not.toContain("(-) Custos variáveis");
  });

  it("marca transferencia como fora dos totais", () => {
    const comTransferencia = renderReportHtml({
      ...data,
      report: {
        ...report,
        dre: {
          ...report.dre,
          groups: report.dre.groups.map((g) =>
            g.group === "TRANSFERS"
              ? { ...g, currentCents: 5_000_00 }
              : g,
          ),
        },
      },
    });

    expect(comTransferencia).toContain("fora dos totais");
  });

  it("mostra variacao com sinal e virgula decimal", () => {
    expect(html).toContain("+24,2%");
  });
});

describe("graficos", () => {
  it("embute SVG, sem depender de JavaScript", () => {
    expect(html).toContain("<svg");
    expect(html).not.toContain("<script");
  });

  it("desenha uma barra por mes", () => {
    const svg = monthlyFlowSvg(report.monthlyFlow);
    // Duas barras por mes: entradas e saidas.
    expect(svg.match(/<rect/g)).toHaveLength(4);
    expect(svg).toContain("jul/26");
    expect(svg).toContain("ago/26");
  });

  it("desenha uma linha com um ponto por dia", () => {
    const svg = balanceSvg(report.balanceSeries);
    const points = svg.match(/points="([^"]+)"/)?.[1].split(" ") ?? [];
    expect(points).toHaveLength(3);
  });

  it("nao quebra com saldo constante", () => {
    // Divisao por (max - min) daria NaN se a faixa fosse zero.
    const svg = balanceSvg([
      { date: "2026-08-01", balanceCents: 1000 },
      { date: "2026-08-02", balanceCents: 1000 },
      { date: "2026-08-03", balanceCents: 1000 },
    ]);

    expect(svg).not.toContain("NaN");
  });

  it("devolve string vazia sem dados, em vez de SVG quebrado", () => {
    expect(topExpensesSvg([])).toBe("");
    expect(balanceSvg([])).toBe("");
  });
});

describe("seguranca do HTML", () => {
  it("escapa texto vindo do banco", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });

  // Descricao de lancamento vem de arquivo enviado pelo usuario: se entrasse
  // crua, o link publico executaria o que estivesse no extrato.
  it("neutraliza descricao maliciosa vinda do extrato", () => {
    const malicioso = renderReportHtml({
      ...data,
      report: {
        ...report,
        biggestOutflows: [
          {
            date: "2026-08-05",
            description: '<img src=x onerror="alert(1)">',
            categoryName: null,
            amountCents: -100,
          },
        ],
      },
    });

    expect(malicioso).not.toContain("<img src=x");
    expect(malicioso).toContain("&lt;img src=x");
  });

  it("escapa o nome da empresa", () => {
    const malicioso = renderReportHtml({
      ...data,
      company: { ...data.company, name: '<b>Empresa</b>' },
    });

    expect(malicioso).toContain("&lt;b&gt;Empresa&lt;/b&gt;");
  });
});

describe("rodape", () => {
  it("assina e data o documento", () => {
    expect(html).toContain("Gerado por Grenor");
    expect(html).toContain("01/09/2026");
  });
});

describe("parecer executivo", () => {
  it("omite a secao inteira quando nao ha parecer", () => {
    expect(html).not.toContain("Sumário executivo");
  });

  it("quebra em paragrafos nas linhas em branco", () => {
    const comParecer = renderReportHtml({
      ...data,
      summary: "Primeiro parágrafo.\n\nSegundo parágrafo.",
    });

    expect(comParecer).toContain("Sumário executivo");
    expect(comParecer).toContain(">Primeiro parágrafo.<");
    expect(comParecer).toContain(">Segundo parágrafo.<");
  });

  it("escapa o parecer, que agora e texto digitado pelo usuario", () => {
    // O parecer virou campo editavel (Fase 7) e o link publico abre na
    // maquina do cliente do escritorio: e entrada de usuario num documento
    // que sai do nosso dominio.
    const malicioso = renderReportHtml({
      ...data,
      summary: '<script>alert("x")</script>',
    });

    expect(malicioso).not.toContain('<script>alert("x")</script>');
    expect(malicioso).toContain("&lt;script&gt;");
  });
});
