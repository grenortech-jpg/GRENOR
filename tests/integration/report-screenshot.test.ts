import { existsSync } from "node:fs";

import { afterAll, describe, expect, it } from "vitest";
import { chromium } from "playwright-core";

import { loadPeriodReport } from "@/lib/reports/load";
import { wrapForPrint } from "@/lib/reports/pdf";
import { renderReportHtml } from "@/lib/reports/report-html";
import { prisma } from "@/lib/prisma";

/**
 * Captura o relatorio como imagem, para conferencia visual.
 *
 * Numero certo em HTML errado continua sendo relatorio errado: e o documento
 * que o cliente do escritorio abre. Rodar com SHOT=true grava os PNGs.
 */

const BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
];

const executablePath =
  process.env.CHROME_EXECUTABLE_PATH ?? BROWSERS.find((p) => existsSync(p));

afterAll(async () => {
  await prisma.$disconnect();
});

describe.skipIf(!executablePath)("aparencia do relatorio", () => {
  it("renderiza sem texto sobreposto nem area vazia", async () => {
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
        "Agosto fechou com faturamento de R$ 182 mil e resultado operacional de R$ 44 mil, uma margem de 25,7%.",
      generatedAt: new Date(Date.UTC(2026, 8, 1)),
    });

    const browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ["--no-sandbox"],
    });

    try {
      const page = await browser.newPage({
        viewport: { width: 860, height: 1200 },
        deviceScaleFactor: 2,
      });

      await page.setContent(wrapForPrint(html, "Relatório"), {
        waitUntil: "networkidle",
      });

      if (process.env.SHOT === "true") {
        await page.screenshot({
          path: "relatorio-pagina-1.png",
          clip: { x: 0, y: 0, width: 860, height: 1200 },
        });
        await page.screenshot({ path: "relatorio-completo.png", fullPage: true });
      }

      // A fonte Inter tem que ter chegado: senao o documento sai com a fonte
      // padrao do sistema, diferente em cada maquina.
      const fontLoaded = await page.evaluate(() =>
        document.fonts.check("600 26px Inter"),
      );
      expect(fontLoaded).toBe(true);

      // Nenhum elemento pode transbordar a largura da pagina A4.
      const overflow = await page.evaluate(() => {
        const root = document.body;
        return root.scrollWidth > root.clientWidth + 1;
      });
      expect(overflow).toBe(false);

      // O documento tem altura de verdade, e nao uma pagina em branco.
      const height = await page.evaluate(() => document.body.scrollHeight);
      expect(height).toBeGreaterThan(1500);

      // Os tres graficos estao presentes e desenhados.
      const svgCount = await page.evaluate(
        () => document.querySelectorAll("svg").length,
      );
      expect(svgCount).toBeGreaterThanOrEqual(3);
    } finally {
      await browser.close();
    }
  }, 120_000);
});
