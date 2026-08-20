import "server-only";

import { existsSync } from "node:fs";

import chromium from "@sparticuz/chromium";
import { chromium as playwright, type Browser } from "playwright-core";

/**
 * Geracao de PDF (Secao 2).
 *
 * Na Vercel roda o Chromium empacotado do @sparticuz/chromium - o Playwright
 * completo nao cabe numa function. Em desenvolvimento usa o Chrome ou o Edge ja
 * instalados na maquina, porque o binario do sparticuz e compilado para o
 * ambiente da Lambda e nao executa no Windows.
 *
 * O HTML vai por setContent, e nao por navegacao: assim o gerador nao precisa
 * fazer uma requisicao de volta para a propria aplicacao, nao depende de o
 * relatorio estar publicado, e nao ha URL interna a proteger.
 */

const LOCAL_BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

function isServerless(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function findLocalBrowser(): string | null {
  if (process.env.CHROME_EXECUTABLE_PATH) {
    return process.env.CHROME_EXECUTABLE_PATH;
  }
  return LOCAL_BROWSERS.find((path) => existsSync(path)) ?? null;
}

async function launch(): Promise<Browser> {
  if (isServerless()) {
    return playwright.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  const executablePath = findLocalBrowser();

  if (!executablePath) {
    throw new Error(
      "Nenhum navegador encontrado para gerar o PDF. Instale o Google Chrome ou defina CHROME_EXECUTABLE_PATH no .env.",
    );
  }

  return playwright.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
}

/** Envolve o corpo do relatorio num documento completo para impressao. */
export function wrapForPrint(body: string, title: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; background: #ffffff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { size: A4 portrait; margin: 14mm 12mm; }
  table { page-break-inside: auto; }
  tr { page-break-inside: avoid; }
</style>
</head>
<body>${body}</body>
</html>`;
}

export async function renderPdf(html: string): Promise<Buffer> {
  const browser = await launch();

  try {
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: "networkidle" });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
