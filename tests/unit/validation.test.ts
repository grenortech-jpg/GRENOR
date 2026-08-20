import { describe, expect, it } from "vitest";

import {
  firstIssue,
  parseBankAccount,
  parseCompany,
  parseId,
  parseWorkspace,
} from "@/lib/validation/schemas";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

describe("workspace", () => {
  it("aceita nome valido", () => {
    expect(parseWorkspace(form({ name: "Contabilidade Silva" })).success).toBe(true);
  });

  it("cobra o nome", () => {
    const parsed = parseWorkspace(form({}));
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(firstIssue(parsed.error)).toBe("Informe o nome do escritório.");
    }
  });

  it("apara espacos", () => {
    const parsed = parseWorkspace(form({ name: "  Silva Contábil  " }));
    if (parsed.success) expect(parsed.data.name).toBe("Silva Contábil");
  });
});

describe("empresa", () => {
  it("aceita apenas o nome", () => {
    const parsed = parseCompany(form({ name: "Padaria do Bairro" }));

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.cnpj).toBeUndefined();
      expect(parsed.data.segment).toBeUndefined();
    }
  });

  it("normaliza CNPJ valido para so digitos", () => {
    const parsed = parseCompany(
      form({ name: "Empresa", cnpj: "11.222.333/0001-81" }),
    );

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.cnpj).toBe("11222333000181");
  });

  it("recusa CNPJ com digito verificador errado", () => {
    const parsed = parseCompany(
      form({ name: "Empresa", cnpj: "11.222.333/0001-82" }),
    );

    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(firstIssue(parsed.error)).toBe("CNPJ inválido.");
  });

  it("campo opcional em branco vira undefined, nao string vazia", () => {
    // Gravar "" no banco faria a interface exibir um CNPJ vazio como se
    // existisse.
    const parsed = parseCompany(form({ name: "Empresa", cnpj: "  ", segment: "" }));

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.cnpj).toBeUndefined();
      expect(parsed.data.segment).toBeUndefined();
    }
  });

  it("cobra nome com ao menos dois caracteres", () => {
    expect(parseCompany(form({ name: "A" })).success).toBe(false);
  });
});

describe("conta bancaria", () => {
  const base = {
    bankName: "Inter",
    nickname: "Conta movimento",
    openingBalanceCents: "50.000,00",
    openingBalanceDate: "2026-08-01",
  };

  it("aceita dados completos e converte para centavos", () => {
    const parsed = parseBankAccount(form(base));

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.openingBalanceCents).toBe(5_000_000);
      expect(parsed.data.openingBalanceDate.toISOString()).toBe(
        "2026-08-01T00:00:00.000Z",
      );
    }
  });

  // Conta no cheque especial comeca negativa; recusar isso impediria o
  // cadastro de uma situacao real.
  it("aceita saldo inicial negativo", () => {
    const parsed = parseBankAccount(
      form({ ...base, openingBalanceCents: "-1.250,45" }),
    );

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.openingBalanceCents).toBe(-125045);
  });

  it("aceita saldo inicial zero", () => {
    const parsed = parseBankAccount(form({ ...base, openingBalanceCents: "0,00" }));

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.openingBalanceCents).toBe(0);
  });

  it("cobra o saldo inicial, que e obrigatorio pela Secao 4", () => {
    const parsed = parseBankAccount(form({ ...base, openingBalanceCents: "" }));

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(firstIssue(parsed.error)).toBe("Informe o saldo inicial.");
    }
  });

  it("recusa saldo que nao e numero", () => {
    const parsed = parseBankAccount(
      form({ ...base, openingBalanceCents: "cinquenta mil" }),
    );

    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(firstIssue(parsed.error)).toMatch(/inválido/i);
  });

  it("recusa data invalida", () => {
    expect(
      parseBankAccount(form({ ...base, openingBalanceDate: "2026-02-31" })).success,
    ).toBe(false);
  });

  it("cobra banco e apelido", () => {
    expect(parseBankAccount(form({ ...base, bankName: "" })).success).toBe(false);
    expect(parseBankAccount(form({ ...base, nickname: "" })).success).toBe(false);
  });
});

describe("identificadores", () => {
  it("aceita uuid", () => {
    expect(parseId(form({ id: crypto.randomUUID() })).success).toBe(true);
  });

  it("recusa qualquer outra coisa", () => {
    // Um id vindo do cliente nunca chega ao Prisma sem passar por aqui.
    expect(parseId(form({ id: "123" })).success).toBe(false);
    expect(parseId(form({ id: "'; DROP TABLE transactions; --" })).success).toBe(
      false,
    );
    expect(parseId(form({})).success).toBe(false);
  });
});
