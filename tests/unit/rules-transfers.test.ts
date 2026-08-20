import { describe, expect, it } from "vitest";

import {
  applyRules,
  findMatchingRule,
  matchesRule,
  sortRules,
  validatePattern,
  type MatchableRule,
} from "@/lib/rules/engine";
import { detectTransferPairs } from "@/lib/transactions/transfers";

function rule(overrides: Partial<MatchableRule> = {}): MatchableRule {
  return {
    id: "r1",
    categoryId: "c1",
    matchType: "CONTAINS",
    pattern: "TARIFA",
    priority: 100,
    active: true,
    ...overrides,
  };
}

describe("comparacao de regras", () => {
  it("ignora acento, caixa e espaco duplicado", () => {
    const r = rule({ pattern: "manutenção conta" });

    expect(matchesRule("TAR  MANUTENCAO   CONTA", r)).toBe(true);
    expect(matchesRule("tar manutenção conta", r)).toBe(true);
  });

  it("respeita STARTS_WITH", () => {
    const r = rule({ matchType: "STARTS_WITH", pattern: "PIX RECEBIDO" });

    expect(matchesRule("PIX RECEBIDO JOÃO", r)).toBe(true);
    expect(matchesRule("ESTORNO PIX RECEBIDO JOÃO", r)).toBe(false);
  });

  it("aplica expressao regular", () => {
    const r = rule({ matchType: "REGEX", pattern: "^(TED|PIX) (ENVIAD|RECEBID)" });

    expect(matchesRule("TED ENVIADA FORNECEDOR", r)).toBe(true);
    expect(matchesRule("PIX RECEBIDO MARIA", r)).toBe(true);
    expect(matchesRule("BOLETO PAGO", r)).toBe(false);
  });

  it("regra inativa nunca casa", () => {
    expect(matchesRule("TARIFA BANCARIA", rule({ active: false }))).toBe(false);
  });

  it("regex invalido falha em silencio, sem derrubar a categorizacao", () => {
    const r = rule({ matchType: "REGEX", pattern: "([a-z" });
    expect(matchesRule("QUALQUER COISA", r)).toBe(false);
  });

  it("padrao vazio nao casa com tudo", () => {
    expect(matchesRule("QUALQUER COISA", rule({ pattern: "   " }))).toBe(false);
  });
});

describe("ordem de precedencia", () => {
  it("menor prioridade decide primeiro", () => {
    const rules = [
      rule({ id: "geral", pattern: "PIX", categoryId: "receita", priority: 100 }),
      rule({
        id: "especifica",
        pattern: "PIX RECEBIDO CONTADOR",
        categoryId: "servicos",
        priority: 10,
      }),
    ];

    expect(findMatchingRule("PIX RECEBIDO CONTADOR", rules)?.id).toBe("especifica");
  });

  it("em empate de prioridade, o padrao mais especifico ganha", () => {
    // Sem esse desempate o resultado dependeria da ordem que o banco devolveu.
    const rules = [
      rule({ id: "curta", pattern: "PIX", priority: 100 }),
      rule({ id: "longa", pattern: "PIX RECEBIDO CONTADOR", priority: 100 }),
    ];

    expect(findMatchingRule("PIX RECEBIDO CONTADOR", rules)?.id).toBe("longa");
    expect(sortRules(rules)[0].id).toBe("longa");
  });

  it("nao casa nada quando nenhuma regra serve", () => {
    expect(findMatchingRule("COMPRA SUPERMERCADO", [rule()])).toBeNull();
  });
});

describe("aplicacao em lote", () => {
  it("categoriza so o que casa e registra a regra usada", () => {
    const rules = [
      rule({ id: "tarifas", pattern: "TAR MANUT", categoryId: "tarifas" }),
      rule({ id: "cartao", pattern: "REC CARTAO", categoryId: "vendas" }),
    ];

    const results = applyRules(
      [
        { id: "t1", description: "TAR MANUT CONTA" },
        { id: "t2", description: "REC CARTAO DEBITO CIELO D+1" },
        { id: "t3", description: "PAG BOLETO FORNECEDOR" },
      ],
      rules,
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      transactionId: "t1",
      categoryId: "tarifas",
      ruleId: "tarifas",
    });
    expect(results.some((r) => r.transactionId === "t3")).toBe(false);
  });

  it("cada transacao usa apenas a primeira regra que casa", () => {
    const rules = [
      rule({ id: "a", pattern: "PIX", categoryId: "ca", priority: 1 }),
      rule({ id: "b", pattern: "RECEBIDO", categoryId: "cb", priority: 2 }),
    ];

    const results = applyRules([{ id: "t1", description: "PIX RECEBIDO" }], rules);

    expect(results).toHaveLength(1);
    expect(results[0].categoryId).toBe("ca");
  });
});

describe("validacao do padrao", () => {
  it("aceita texto simples", () => {
    expect(validatePattern("CONTAINS", "TARIFA")).toEqual({ ok: true });
  });

  it("recusa padrao vazio", () => {
    expect(validatePattern("CONTAINS", "  ").ok).toBe(false);
  });

  it("recusa padrao longo demais", () => {
    expect(validatePattern("CONTAINS", "A".repeat(300)).ok).toBe(false);
  });

  it("recusa regex com sintaxe invalida", () => {
    const result = validatePattern("REGEX", "([a-z");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/inválida/i);
  });

  it("aceita regex bem comportado", () => {
    expect(validatePattern("REGEX", "^(TED|PIX) (ENVIAD|RECEBID)").ok).toBe(true);
  });

  it("recusa regex com retrocesso catastrofico", () => {
    // (a+)+$ contra uma cadeia longa trava o processo inteiro, e o processo e
    // compartilhado por todos os workspaces.
    const result = validatePattern("REGEX", "^(A+)+$");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/lenta/i);
  });
});

// ---------------------------------------------------------------------------

const day = (d: number) => new Date(Date.UTC(2026, 7, d));

function movement(
  id: string,
  accountId: string,
  d: number,
  amountCents: number,
) {
  return { id, accountId, date: day(d), amountCents, description: id };
}

describe("deteccao de transferencias", () => {
  it("liga saida e entrada de mesmo valor em contas diferentes", () => {
    const pairs = detectTransferPairs([
      movement("saida", "conta-a", 10, -500000),
      movement("entrada", "conta-b", 10, 500000),
    ]);

    expect(pairs).toHaveLength(1);
    expect(pairs[0].outgoing.id).toBe("saida");
    expect(pairs[0].incoming.id).toBe("entrada");
    expect(pairs[0].gapDays).toBe(0);
  });

  it("aceita ate dois dias de diferenca", () => {
    expect(
      detectTransferPairs([
        movement("saida", "conta-a", 10, -500000),
        movement("entrada", "conta-b", 12, 500000),
      ]),
    ).toHaveLength(1);

    expect(
      detectTransferPairs([
        movement("saida", "conta-a", 10, -500000),
        movement("entrada", "conta-b", 13, 500000),
      ]),
    ).toHaveLength(0);
  });

  it("nao liga lancamentos da mesma conta", () => {
    // Estorno na propria conta nao e transferencia.
    expect(
      detectTransferPairs([
        movement("saida", "conta-a", 10, -500000),
        movement("estorno", "conta-a", 10, 500000),
      ]),
    ).toHaveLength(0);
  });

  it("nao liga valores diferentes", () => {
    expect(
      detectTransferPairs([
        movement("saida", "conta-a", 10, -500000),
        movement("entrada", "conta-b", 10, 499900),
      ]),
    ).toHaveLength(0);
  });

  it("cada lancamento entra em no maximo um par", () => {
    const pairs = detectTransferPairs([
      movement("saida1", "conta-a", 10, -100000),
      movement("saida2", "conta-a", 10, -100000),
      movement("entrada1", "conta-b", 10, 100000),
    ]);

    expect(pairs).toHaveLength(1);
  });

  it("prefere o par de menor diferenca de dias", () => {
    const pairs = detectTransferPairs([
      movement("saida", "conta-a", 10, -100000),
      movement("entrada-distante", "conta-b", 12, 100000),
      movement("entrada-proxima", "conta-b", 10, 100000),
    ]);

    expect(pairs).toHaveLength(1);
    expect(pairs[0].incoming.id).toBe("entrada-proxima");
  });

  it("e estavel: a mesma entrada produz o mesmo resultado", () => {
    const movements = [
      movement("s1", "conta-a", 10, -100000),
      movement("s2", "conta-a", 11, -100000),
      movement("e1", "conta-b", 10, 100000),
      movement("e2", "conta-b", 11, 100000),
    ];

    const first = detectTransferPairs(movements).map(
      (p) => `${p.outgoing.id}->${p.incoming.id}`,
    );
    const second = detectTransferPairs([...movements].reverse()).map(
      (p) => `${p.outgoing.id}->${p.incoming.id}`,
    );

    expect(first).toEqual(second);
  });
});
