import { describe, expect, it } from "vitest";

import { parseStatement } from "@/lib/import/parse";

/**
 * Planilha qualquer, nao so extrato de banco.
 *
 * A deteccao automatica cobre os layouts conhecidos; o mapeamento manual cobre
 * o resto. Enquanto houver uma coluna de data, uma de descricao e uma de valor,
 * em linhas, o arquivo entra - venha de banco, de ERP, de PDV ou de uma
 * planilha que o cliente mantem a mao.
 */

const csv = (lines: string[]) => Buffer.from(lines.join("\n"), "utf8");

describe("planilha fora do padrao bancario", () => {
  // Controle de caixa feito a mao: colunas em ordem inusitada, nomes que
  // nenhuma heuristica adivinha, e uma coluna de observacao no meio.
  const arquivo = csv([
    "Ref;Quando;Quem;Obs;Quanto",
    "001;03/08/2026;Mercado Silva;compra semanal;-345,90",
    "002;05/08/2026;Cliente Joao;servico prestado;1.200,00",
    "003;08/08/2026;Posto Ipiranga;combustivel;-210,45",
  ]);

  it("expoe a amostra para o usuario escolher as colunas", async () => {
    const parsed = await parseStatement(arquivo, "controle.csv");

    expect(parsed.sampleRows?.length).toBeGreaterThan(0);
    expect(parsed.headers).toEqual(["Ref", "Quando", "Quem", "Obs", "Quanto"]);
  });

  it("importa corretamente com mapeamento manual", async () => {
    const parsed = await parseStatement(arquivo, "controle.csv", {
      mapping: { date: 1, description: 2, amount: 4 },
    });

    expect(parsed.transactions).toHaveLength(3);
    expect(parsed.transactions[0]).toMatchObject({
      description: "Mercado Silva",
      amountCents: -34590,
    });
    expect(parsed.transactions[1].amountCents).toBe(120000);
  });

  it("o mapeamento manual vence a deteccao automatica", async () => {
    // Aponta a descricao para a coluna de observacao: mesmo que a deteccao
    // preferisse outra, quem manda e a escolha do usuario.
    const parsed = await parseStatement(arquivo, "controle.csv", {
      mapping: { date: 1, description: 3, amount: 4 },
    });

    expect(parsed.transactions[0].description).toBe("compra semanal");
  });

  it("aceita colunas separadas de entrada e saida", async () => {
    const planilha = csv([
      "Data;Historico;Recebido;Pago",
      "03/08/2026;Venda balcao;1.500,00;",
      "04/08/2026;Aluguel;;2.300,00",
      "05/08/2026;Venda balcao;890,50;",
    ]);

    const parsed = await parseStatement(planilha, "caixa.csv", {
      mapping: { date: 0, description: 1, credit: 2, debit: 3 },
    });

    expect(parsed.transactions).toHaveLength(3);
    expect(parsed.transactions[0].amountCents).toBe(150000);
    expect(parsed.transactions[1].amountCents).toBe(-230000);
    expect(parsed.transactions[2].amountCents).toBe(89050);
  });

  it("ignora linhas sem data, venham de onde vierem", async () => {
    const planilha = csv([
      "Relatorio de caixa - agosto",
      "Gerado por Fulano",
      "Data;Historico;Valor",
      "03/08/2026;Venda;100,00",
      "subtotal;;100,00",
      "05/08/2026;Compra;-40,00",
      "TOTAL GERAL;;60,00",
    ]);

    const parsed = await parseStatement(planilha, "relatorio.csv");

    expect(parsed.transactions).toHaveLength(2);
    expect(parsed.transactions.map((t) => t.amountCents)).toEqual([10000, -4000]);
  });

  it("informa o que nao conseguiu ler, em vez de falhar em silencio", async () => {
    const planilha = csv([
      "Data;Historico;Valor",
      "03/08/2026;Venda;100,00",
      "04/08/2026;Linha quebrada;valor invalido",
    ]);

    const parsed = await parseStatement(planilha, "parcial.csv");

    expect(parsed.transactions).toHaveLength(1);
    expect(parsed.warnings.length).toBeGreaterThan(0);
    expect(parsed.warnings[0].reason).toMatch(/não reconhecido/i);
  });
});
