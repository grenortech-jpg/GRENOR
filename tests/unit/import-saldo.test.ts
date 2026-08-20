import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseStatement } from "@/lib/import/parse";
import { detectMapping } from "@/lib/import/tabular";

/**
 * Regressao de um extrato real do Inter que quebrou a importacao de tres
 * maneiras ao mesmo tempo:
 *
 *  1. O cabecalho do banco vem em UMA celula ("BANCO INTER S.A. - 077"), e
 *     isHeaderRow exigia duas. Com isso a linha de titulos nunca era achada e
 *     o mapeamento por nome de coluna nao acontecia.
 *  2. Sem os titulos, a deteccao por conteudo escolheu a coluna Saldo em vez
 *     da coluna Valor - o desempate veio da linha "SALDO FINAL", que tem Valor
 *     vazio e Saldo preenchido. Resultado: o saldo corrido virou o valor de
 *     cada lancamento e o extrato inteiro ficou errado.
 *  3. "SALDO ANTERIOR" e "SALDO FINAL" tem data e valor, entao passavam pela
 *     heuristica e viravam lancamentos - injetando R$ 50.000 de receita
 *     fantasma no mes.
 */

const FIXTURE = join(
  process.cwd(),
  "tests",
  "fixtures",
  "extrato-inter-com-saldo.csv",
);

const result = parseStatement(readFileSync(FIXTURE), "extrato-agosto.csv");

describe("extrato do Inter com coluna de saldo", () => {
  it("acha a linha de titulos apesar do cabecalho de uma celula", () => {
    expect(result.headers).toEqual(["Data", "Histórico", "Valor", "Saldo"]);
  });

  it("mapeia Valor, e nao Saldo", () => {
    expect(result.mapping?.amount).toBe(2);
  });

  it("le o valor do lancamento, nao o saldo acumulado", () => {
    const pix = result.transactions.find((t) =>
      t.description.includes("ANA LÚCIA"),
    );

    // Valor 1.504,17 com saldo 51.504,17: o defeito importava o saldo.
    expect(pix?.amountCents).toBe(150417);
  });

  it("respeita o sinal a direita", () => {
    const boleto = result.transactions.find((t) =>
      t.description.includes("MOINHO"),
    );

    // "7.637,72-" e saida.
    expect(boleto?.amountCents).toBe(-763772);
  });

  it("nao importa SALDO ANTERIOR nem SALDO FINAL", () => {
    const saldos = result.transactions.filter((t) =>
      /^SALDO/i.test(t.description),
    );

    expect(saldos).toHaveLength(0);
  });

  it("preserva acentuacao vinda de latin-1", () => {
    expect(result.encoding).toBe("win1252");
    expect(
      result.transactions.some((t) => t.description.includes("JOSÉ ANTÔNIO")),
    ).toBe(true);
  });

  it("os lancamentos batem com o saldo do proprio extrato", () => {
    // Saldo anterior 50.000,00 e a soma dos movimentos precisa levar ao saldo
    // da ultima linha importada. E a conferencia que o contador faria a mao.
    const soma = result.transactions.reduce(
      (total, t) => total + t.amountCents,
      0,
    );

    expect(soma).not.toBe(0);
    expect(Math.abs(soma)).toBeLessThan(50_000_00);
  });
});

describe("deteccao da coluna de saldo", () => {
  it("descarta a coluna acumulada quando ha duas colunas de dinheiro", () => {
    const rows = [
      ["01/08/2026", "ENTRADA", "100,00", "1.100,00"],
      ["02/08/2026", "SAIDA", "-50,00", "1.050,00"],
      ["03/08/2026", "ENTRADA", "25,00", "1.075,00"],
      ["04/08/2026", "SAIDA", "-75,00", "1.000,00"],
    ];

    expect(detectMapping(null, rows)?.amount).toBe(2);
  });

  it("nao se confunde quando a coluna acumulada vem antes", () => {
    const rows = [
      ["01/08/2026", "ENTRADA", "1.100,00", "100,00"],
      ["02/08/2026", "SAIDA", "1.050,00", "-50,00"],
      ["03/08/2026", "ENTRADA", "1.075,00", "25,00"],
      ["04/08/2026", "SAIDA", "1.000,00", "-75,00"],
    ];

    expect(detectMapping(null, rows)?.amount).toBe(3);
  });

  it("mantem a primeira coluna quando nenhuma e saldo", () => {
    const rows = [
      ["01/08/2026", "ENTRADA", "100,00", "7"],
      ["02/08/2026", "SAIDA", "-50,00", "3"],
      ["03/08/2026", "ENTRADA", "25,00", "9"],
    ];

    expect(detectMapping(null, rows)?.amount).toBe(2);
  });
});

describe("linhas de saldo", () => {
  it.each([
    "SALDO ANTERIOR",
    "SALDO FINAL",
    "Saldo do dia",
    "SALDO EM 31/08/2026",
  ])("descarta %s", (description) => {
    const csv = [
      "Data;Historico;Valor",
      "01/08/2026;PIX RECEBIDO;100,00",
      `02/08/2026;${description};5.000,00`,
    ].join("\n");

    const parsed = parseStatement(Buffer.from(csv, "utf8"), "teste.csv");

    expect(parsed.transactions).toHaveLength(1);
    expect(parsed.transactions[0].description).toBe("PIX RECEBIDO");
  });

  it("nao descarta lancamento que apenas menciona saldo", () => {
    const csv = [
      "Data;Historico;Valor",
      "01/08/2026;PAGTO SALDO DEVEDOR CARTAO;-1.200,00",
    ].join("\n");

    const parsed = parseStatement(Buffer.from(csv, "utf8"), "teste.csv");

    expect(parsed.transactions).toHaveLength(1);
    expect(parsed.transactions[0].amountCents).toBe(-120000);
  });
});
