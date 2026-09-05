import { afterAll, describe, expect, it } from "vitest";

import { isCnpjLookupEnabled, lookupCnpjProfile } from "@/lib/categorization/cnpj-lookup";
import { prisma } from "@/lib/prisma";

/**
 * Enriquecimento de CNPJ contra as APIs publicas de verdade (Fase 11).
 *
 * Depende de internet e de terceiros, entao so roda com CNPJ_LOOKUP_ENABLED
 * diferente de "false" (a CI desliga). O CNPJ e o do Banco do Brasil, que nao
 * vai deixar de existir; o teste apaga o que gravou.
 */

const BANCO_DO_BRASIL = "00000000000191";

afterAll(async () => {
  await prisma.cnpjProfile.deleteMany({ where: { cnpj: BANCO_DO_BRASIL } });
  await prisma.$disconnect();
});

describe.skipIf(!isCnpjLookupEnabled())("consulta de CNPJ", () => {
  it("descobre o CNAE, grava no cache e reaproveita na segunda chamada", async () => {
    await prisma.cnpjProfile.deleteMany({ where: { cnpj: BANCO_DO_BRASIL } });

    const first = await lookupCnpjProfile(BANCO_DO_BRASIL);
    if (!first) {
      // API indisponivel neste momento: nada foi gravado, e e isso que se espera.
      expect(await prisma.cnpjProfile.count({ where: { cnpj: BANCO_DO_BRASIL } })).toBe(0);
      return;
    }

    expect(first.notFound).toBe(false);
    expect(first.cnaePrincipal?.startsWith("64")).toBe(true);
    expect(first.hits).toBe(0);

    const second = await lookupCnpjProfile(BANCO_DO_BRASIL);
    expect(second?.source).toBe(first.source);
    expect(second?.hits).toBe(1);
  }, 30_000);
});
