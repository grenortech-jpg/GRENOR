import { existsSync, writeFileSync } from "node:fs";

import { afterAll, describe, expect, it } from "vitest";

import { loadPeriodReport } from "@/lib/reports/load";
import { renderPdf, wrapForPrint } from "@/lib/reports/pdf";
import { renderReportHtml } from "@/lib/reports/report-html";
import { prisma } from "@/lib/prisma";

/**
 * Gera um PDF de verdade a partir dos dados reais do banco.
 *
 * Abrir um navegador headless e caro, entao a suite so roda quando ha um
 * Chrome ou Edge instalado. Em CI sem navegador, ela e pulada em vez de
 * quebrar.
 */

const BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

const hasBrowser =
  Boolean(process.env.CHROME_EXECUTABLE_PATH) ||
  BROWSERS.some((path) => existsSync(path));

afterAll(async () => {
  await prisma.$disconnect();
});

describe.skipIf(!hasBrowser)("geracao de PDF", () => {
  it("produz um PDF valido a partir do relatorio", async () => {
    const workspace = await prisma.workspace.findFirstOrThrow();
    const company = await prisma.company.findFirstOrThrow();

    const report = await loadPeriodReport({
      companyId: company.id,
      workspaceId: workspace.id,
      month: { year: 2026, month: 8 },
    });

    const html = renderReportHtml({
      company: {
        name: company.name,
        cnpj: company.cnpj,
        logoUrl: company.logoUrl,
      },
      workspace: { name: workspace.name, logoUrl: workspace.logoUrl },
      month: { year: 2026, month: 8 },
      report,
      summary:
        "Parágrafo de teste do sumário executivo, para conferir a quebra de página.",
      generatedAt: new Date(Date.UTC(2026, 8, 1)),
    });

    const pdf = await renderPdf(wrapForPrint(html, "Relatório de teste"));

    // Assinatura de arquivo PDF.
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(10_000);

    const raw = pdf.toString("latin1");
    const pages = (raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pages).toBeGreaterThanOrEqual(2);

    // Guarda o arquivo para inspecao visual quando rodado na mao.
    if (process.env.KEEP_PDF === "true") {
      writeFileSync("relatorio-teste.pdf", pdf);
    }

    console.log(
      `\nPDF: ${(pdf.byteLength / 1024).toFixed(1)} KB, ${pages} páginas`,
    );
  }, 120_000);

  it("o HTML do relatorio nao carrega JavaScript", async () => {
    const workspace = await prisma.workspace.findFirstOrThrow();
    const company = await prisma.company.findFirstOrThrow();

    const report = await loadPeriodReport({
      companyId: company.id,
      workspaceId: workspace.id,
      month: { year: 2026, month: 8 },
    });

    const html = renderReportHtml({
      company: {
        name: company.name,
        cnpj: company.cnpj,
        logoUrl: company.logoUrl,
      },
      workspace: { name: workspace.name, logoUrl: workspace.logoUrl },
      month: { year: 2026, month: 8 },
      report,
      summary: null,
      generatedAt: new Date(),
    });

    // O link publico abre na maquina do cliente do escritorio: nada de script.
    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("<svg");
  });
});
