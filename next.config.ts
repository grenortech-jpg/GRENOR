import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * O Chromium e o Playwright nao podem ser processados pelo bundler.
   *
   * O @sparticuz/chromium carrega um binario a partir do proprio diretorio no
   * disco; empacotado, ele perde o caminho e a geracao de PDF falha em
   * producao com um erro que nao acontece em desenvolvimento.
   */
  serverExternalPackages: [
    "@sparticuz/chromium",
    "playwright-core",
    "@prisma/adapter-pg",
    // CommonJS com requires dinamicos; roda melhor fora do bundle.
    "exceljs",
  ],

  /**
   * O binario do Chromium precisa ir junto no pacote da function que gera o
   * PDF. Sem isto, o rastreamento de dependencias nao o inclui - ele nao e
   * alcancado por nenhum `import`.
   */
  outputFileTracingIncludes: {
    "/api/relatorio/**": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
};

export default nextConfig;
