import { describe, expect, it } from "vitest";

import { DEFAULT_CATEGORIES } from "@/lib/categories/default-plan";
import { CNAE_TARGET_NAMES, suggestDefaultIdForCnae } from "@/lib/categorization/cnae-map";
import { extractCnpj, formatCnpj, isValidCnpj } from "@/lib/categorization/cnpj";
import { parseCnpjApiResponse } from "@/lib/categorization/cnpj-api";
import { memoryKey } from "@/lib/categorization/memory-key";
import { resolveCategories } from "@/lib/categorization/resolve";

/**
 * Memoria de categorizacao em dois niveis (Fase 11).
 */

const byName = (name: string) => {
  const category = DEFAULT_CATEGORIES.find((c) => c.name === name);
  if (!category) throw new Error(`categoria padrao inexistente: ${name}`);
  return category.id;
};

describe("chave da memoria", () => {
  it("ignora o que muda de um lancamento para outro", () => {
    expect(memoryKey("PIX RECEBIDO 0106")).toBe("PIX RECEBIDO");
    expect(memoryKey("PIX RECEBIDO 0206")).toBe("PIX RECEBIDO");
    expect(memoryKey("SISPAG FOLHA PAGAMENTO 07/2026")).toBe("SISPAG FOLHA PAGAMENTO");
    expect(memoryKey("PAG BOLETO 23790.12345 MOINHO")).toBe("PAG BOLETO MOINHO");
  });

  it("mantem o que identifica a contraparte", () => {
    expect(memoryKey("Pag Fornecedor Moinho Central")).toBe("PAG FORNECEDOR MOINHO CENTRAL");
    expect(memoryKey("ENERGIA ELÉTRICA CEMIG")).toBe("ENERGIA ELETRICA CEMIG");
    expect(memoryKey("CIELO CREDITO D+30")).toBe("CIELO CREDITO D+30");
  });

  it("descricao so numerica nao vira chave vazia", () => {
    expect(memoryKey("123456789")).toBe("123456789");
  });
});

describe("CNPJ na descricao", () => {
  it("valida os digitos verificadores", () => {
    expect(isValidCnpj("11.444.777/0001-61")).toBe(true);
    expect(isValidCnpj("00000000000191")).toBe(true);
    expect(isValidCnpj("11.444.777/0001-62")).toBe(false);
    expect(isValidCnpj("11111111111111")).toBe(false);
    expect(isValidCnpj("1144477700016")).toBe(false);
  });

  it("extrai com ou sem pontuacao", () => {
    expect(extractCnpj("PIX ENVIADO 11.444.777/0001-61 FORNECEDOR")).toBe("11444777000161");
    expect(extractCnpj("TED CP:11444777000161 MOINHO")).toBe("11444777000161");
  });

  it("nao confunde numero de documento com CNPJ", () => {
    // 14 digitos com verificador errado: e boleto, nao CNPJ.
    expect(extractCnpj("PAG BOLETO 11444777000162")).toBeNull();
    expect(extractCnpj("PIX RECEBIDO 0106")).toBeNull();
  });

  it("formata para exibicao", () => {
    expect(formatCnpj("11444777000161")).toBe("11.444.777/0001-61");
  });
});

describe("CNAE -> categoria padrao", () => {
  it("todo alvo do mapa existe no plano padrao", () => {
    for (const name of CNAE_TARGET_NAMES) expect(() => byName(name)).not.toThrow();
  });

  it("saida para energia, adquirente e imobiliaria", () => {
    expect(suggestDefaultIdForCnae("3514000", "out")).toBe(byName("Energia, água e internet"));
    expect(suggestDefaultIdForCnae("6619302", "out")).toBe(byName("Taxas de meios de pagamento"));
    expect(suggestDefaultIdForCnae("6821801", "out")).toBe(byName("Aluguel e condomínio"));
    expect(suggestDefaultIdForCnae("4721102", "out")).toBe(byName("Fornecedores / CMV"));
  });

  it("entrada so e reconhecida quando vem de adquirente ou banco", () => {
    expect(suggestDefaultIdForCnae("6619302", "in")).toBe(byName("Receita de vendas"));
    expect(suggestDefaultIdForCnae("4721102", "in")).toBeNull();
  });

  it("CNAE desconhecido ou ausente nao sugere nada", () => {
    expect(suggestDefaultIdForCnae("9999999", "out")).toBeNull();
    expect(suggestDefaultIdForCnae(null, "out")).toBeNull();
  });
});

describe("resposta das APIs de CNPJ", () => {
  it("le BrasilAPI e Minha Receita, que compartilham os campos", () => {
    const parsed = parseCnpjApiResponse({
      razao_social: "MOINHO CENTRAL LTDA",
      cnae_fiscal: 1062700,
      cnae_fiscal_descricao: "Moagem de trigo",
    });
    expect(parsed).toEqual({
      razaoSocial: "MOINHO CENTRAL LTDA",
      cnaePrincipal: "1062700",
      cnaeDescricao: "Moagem de trigo",
    });
  });

  it("resposta sem nada util e null", () => {
    expect(parseCnpjApiResponse({})).toBeNull();
    expect(parseCnpjApiResponse("erro")).toBeNull();
  });
});

describe("ordem de resolucao", () => {
  const categories = [
    { id: "ws-fornecedores", defaultId: byName("Fornecedores / CMV") },
    { id: "ws-energia", defaultId: byName("Energia, água e internet") },
    { id: "ws-vendas", defaultId: byName("Receita de vendas") },
    { id: "ws-custom", defaultId: null },
  ];
  const rules = [
    { id: "r1", categoryId: "ws-energia", matchType: "CONTAINS" as const, pattern: "CEMIG", priority: 100, active: true },
  ];

  it("memoria vence CNPJ, que vence regra; o resto fica pendente", async () => {
    const lookups: string[] = [];
    const { assignments, counts } = await resolveCategories({
      transactions: [
        { id: "t1", description: "ENERGIA CEMIG 07/2026", amountCents: -32045 },
        { id: "t2", description: "PIX 11.444.777/0001-61 MOINHO", amountCents: -900000 },
        { id: "t3", description: "CONTA CEMIG 08/2026", amountCents: -30000 },
        { id: "t4", description: "PIX RECEBIDO 0106", amountCents: 295720 },
      ],
      rules,
      categories,
      recall: async (keys) => {
        expect(keys).toContain("ENERGIA CEMIG");
        return new Map([["ENERGIA CEMIG", "ws-custom"]]);
      },
      lookupCnpj: async (cnpj) => {
        lookups.push(cnpj);
        return { cnaePrincipal: "4721102" };
      },
    });

    expect(assignments).toEqual([
      { transactionId: "t1", categoryId: "ws-custom", source: "MEMORY" },
      { transactionId: "t2", categoryId: "ws-fornecedores", source: "CNPJ" },
      { transactionId: "t3", categoryId: "ws-energia", source: "RULE" },
    ]);
    expect(counts).toMatchObject({ total: 4, memory: 1, cnpj: 1, rules: 1, pending: 1, cnpjsFound: 1, cnpjsLookedUp: 1 });
    expect(lookups).toEqual(["11444777000161"]);
  });

  it("consulta cada CNPJ uma vez e respeita o limite por rodada", async () => {
    const lookups: string[] = [];
    const { counts } = await resolveCategories({
      transactions: [
        { id: "a", description: "PAG 11.444.777/0001-61", amountCents: -100 },
        { id: "b", description: "PAG 11444777000161 DE NOVO", amountCents: -100 },
        { id: "c", description: "PAG 00.000.000/0001-91", amountCents: -100 },
      ],
      rules: [],
      categories,
      recall: async () => new Map(),
      lookupCnpj: async (cnpj) => {
        lookups.push(cnpj);
        return { cnaePrincipal: "4721102" };
      },
      maxLookups: 1,
    });

    expect(lookups).toEqual(["11444777000161"]);
    expect(counts).toMatchObject({ cnpj: 2, cnpjsFound: 2, cnpjsLookedUp: 1, pending: 1 });
  });

  it("entrada de empresa comum nao vira receita por CNPJ", async () => {
    const { assignments } = await resolveCategories({
      transactions: [{ id: "in", description: "PIX 11.444.777/0001-61", amountCents: 50000 }],
      rules: [],
      categories,
      recall: async () => new Map(),
      lookupCnpj: async () => ({ cnaePrincipal: "4721102" }),
    });
    expect(assignments).toEqual([]);
  });

  it("perfil sem CNAE ou categoria padrao ausente no workspace deixa pendente", async () => {
    const { assignments } = await resolveCategories({
      transactions: [
        { id: "x", description: "PAG 11.444.777/0001-61", amountCents: -100 },
        { id: "y", description: "PAG 00.000.000/0001-91", amountCents: -100 },
      ],
      rules: [],
      categories: [{ id: "only-custom", defaultId: null }],
      recall: async () => new Map(),
      lookupCnpj: async (cnpj) => (cnpj === "00000000000191" ? null : { cnaePrincipal: "4721102" }),
    });
    expect(assignments).toEqual([]);
  });
});
