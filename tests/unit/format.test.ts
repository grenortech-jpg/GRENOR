import { describe, expect, it } from "vitest";

import {
  formatAmount,
  formatCnpj,
  formatMoney,
  isValidCnpj,
  normalizeCnpj,
  parseCivilDate,
  parseMoneyToCents,
  toDateInputValue,
} from "@/lib/format";

describe("parseMoneyToCents", () => {
  // Formatos que a Secao 5.1 exige aceitar nos extratos brasileiros.
  it.each([
    ["1.234,56", 123456],
    ["1234,56", 123456],
    ["1234.56", 123456],
    ["-1.234,56", -123456],
    ["1.234,56-", -123456],
    ["R$ 1.234,56", 123456],
    ["r$1.234,56", 123456],
    ["(1.234,56)", -123456],
    ["0,00", 0],
    ["0", 0],
    ["10", 1000],
    ["10,5", 1050],
    ["10,05", 1005],
    ["1.000", 100000],
    ["1.000.000,99", 100000099],
    ["  1.234,56  ", 123456],
  ])("converte %s em %i centavos", (input, expected) => {
    expect(parseMoneyToCents(input)).toBe(expected);
  });

  it.each(["", "   ", "abc", "R$", "1.2.3,4,5x", "--"])(
    "rejeita %s",
    (input) => {
      expect(parseMoneyToCents(input)).toBeNull();
    },
  );

  // Ponto seguido de tres digitos e agrupador de milhar, nao decimal.
  it("nao confunde milhar com decimal", () => {
    expect(parseMoneyToCents("1.234")).toBe(123400);
    expect(parseMoneyToCents("1,234")).toBe(123400);
  });

  it("nao perde centavos por arredondamento de ponto flutuante", () => {
    expect(parseMoneyToCents("0,07")).toBe(7);
    expect(parseMoneyToCents("1,10")).toBe(110);
    expect(parseMoneyToCents("8,29")).toBe(829);
    expect(parseMoneyToCents("1234567,89")).toBe(123456789);
  });
});

describe("formatacao de dinheiro", () => {
  it("exibe centavos como moeda brasileira", () => {
    expect(formatMoney(123456).replace(/ /g, " ")).toBe("R$ 1.234,56");
    expect(formatMoney(-500).replace(/ /g, " ")).toBe("-R$ 5,00");
    expect(formatMoney(0).replace(/ /g, " ")).toBe("R$ 0,00");
  });

  it("exibe valor sem simbolo para tabelas", () => {
    expect(formatAmount(123456)).toBe("1.234,56");
  });

  it("volta ao mesmo valor depois de formatar e reler", () => {
    for (const cents of [0, 1, 99, 100, 12345, -12345, 100000099]) {
      expect(parseMoneyToCents(formatAmount(cents))).toBe(cents);
    }
  });
});

describe("datas civis", () => {
  it("interpreta a data sem deslocar o fuso", () => {
    const date = parseCivilDate("2026-08-20");
    expect(date?.toISOString()).toBe("2026-08-20T00:00:00.000Z");
  });

  it("recusa data inexistente", () => {
    expect(parseCivilDate("2026-02-31")).toBeNull();
    expect(parseCivilDate("2026-13-01")).toBeNull();
    expect(parseCivilDate("20/08/2026")).toBeNull();
    expect(parseCivilDate("")).toBeNull();
  });

  it("ida e volta com o input do formulario", () => {
    const date = parseCivilDate("2026-01-01")!;
    expect(toDateInputValue(date)).toBe("2026-01-01");
  });
});

describe("CNPJ", () => {
  it("valida digitos verificadores", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000181")).toBe(true);
  });

  it("recusa CNPJ invalido", () => {
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
    expect(isValidCnpj("11111111111111")).toBe(false);
    expect(isValidCnpj("123")).toBe(false);
    expect(isValidCnpj("")).toBe(false);
  });

  it("normaliza e formata", () => {
    expect(normalizeCnpj("11.222.333/0001-81")).toBe("11222333000181");
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });
});
