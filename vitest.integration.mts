import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Testes que precisam do banco real (isolamento multi-tenant da Secao 3).
 * Separados dos unitarios para que `npm test` continue rodando sem rede.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    // Um banco compartilhado: suites em paralelo brigariam pelos fixtures.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./tests/integration/server-only-stub.ts", import.meta.url),
      ),
    },
  },
});
