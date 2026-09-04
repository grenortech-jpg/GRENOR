import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { detectSeparator } from "@/lib/import/csv";
import { parseFlexibleDate, parseOfxDate, parseExcelSerial } from "@/lib/import/dates";
import { decodeBuffer } from "@/lib/import/encoding";
import { dedupeHash, normalizeDescription } from "@/lib/import/normalize";
import { detectFileType, parseStatement } from "@/lib/import/parse";
import { ParseError, type ParseResult } from "@/lib/import/types";

const FIXTURES = join(process.cwd(), "tests", "fixtures");
const fixture = (name: string) => readFileSync(join(FIXTURES, name));

describe("deteccao de formato", () => {
  it("reconhece cada formato pelo conteudo, nao pela extensao", async () => {
    // Bancos entregam OFX com extensao .txt e CSV com nome de planilha.
    expect(detectFileType(fixture("extrato-ofx1-latin1.ofx"), "extrato.txt")).toBe("OFX");
    expect(detectFileType(fixture("extrato-ofx2-utf8.ofx"), "sem-extensao")).toBe("OFX");
    expect(detectFileType(fixture("extrato.xlsx"), "extrato.xls")).toBe("XLSX");
    expect(detectFileType(fixture("extrato-csv-virgula.csv"), "extrato.csv")).toBe("CSV");
  });

  it("orienta quem tenta subir .xls antigo", async () => {
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0x00, 0x00]);
    expect(() => detectFileType(ole, "extrato.xls")).toThrow(/salve como \.xlsx/i);
  });
});

describe("encoding", () => {
  it("decodifica latin-1 mesmo quando o header do OFX diz USASCII", async () => {
    const buffer = fixture("extrato-ofx1-latin1.ofx");
    const { text, encoding } = decodeBuffer(buffer);

    expect(text).toContain("<OFX>");
    expect(text).not.toContain("�");
    expect(encoding).toBeTruthy();
  });

  it("preserva acentos de arquivo latin-1", async () => {
    const latin1 = Buffer.from([0x50, 0x41, 0x4f, 0xc7, 0x41, 0x4f]); // "PAOÇAO"
    const { text } = decodeBuffer(latin1);
    expect(text).toContain("Ç");
  });
});

describe("OFX 1.x (SGML)", () => {
  let result: ParseResult;

  beforeAll(async () => {
    result = await parseStatement(
      fixture("extrato-ofx1-latin1.ofx"),
      "extrato-ofx1-latin1.ofx",
    );
  });

  it("extrai todos os lancamentos", async () => {
    expect(result.fileType).toBe("OFX");
    expect(result.transactions).toHaveLength(5);
  });

  it("nao confunde o saldo final com lancamento", async () => {
    // LEDGERBAL/BALAMT tambem e um valor no arquivo; nao pode virar transacao.
    const amounts = result.transactions.map((t) => t.amountCents);
    expect(amounts).not.toContain(5070935);
  });

  it("le data, valor e sinal corretamente", async () => {
    const [primeira] = result.transactions;
    expect(primeira.date.toISOString().slice(0, 10)).toBe("2026-08-03");
    expect(primeira.amountCents).toBe(345000);
    expect(primeira.description).toContain("PIX RECEBIDO");
  });

  it("marca saidas como negativas", async () => {
    const aluguel = result.transactions.find((t) => t.description.includes("ALUGUEL"));
    expect(aluguel?.amountCents).toBe(-120050);
  });

  it("captura o FITID de cada lancamento", async () => {
    expect(result.transactions.every((t) => t.fitId)).toBe(true);
    expect(result.transactions[0].fitId).toBe("2026080300001");
  });

  it("nao duplica texto quando MEMO ja contem NAME", async () => {
    // NAME="ALUGUEL", MEMO="PAGAMENTO ALUGUEL AGOSTO": concatenar produziria
    // "ALUGUEL - PAGAMENTO ALUGUEL AGOSTO". Fica so a versao informativa.
    const aluguel = result.transactions.find((t) => t.fitId === "2026080500002");
    expect(aluguel?.description).toBe("PAGAMENTO ALUGUEL AGOSTO");
  });

  it("junta NAME e MEMO quando se complementam", async () => {
    const complementar = await parseStatement(
      Buffer.from(
        [
          "<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>",
          "<STMTTRN><DTPOSTED>20260803<TRNAMT>-100.00<FITID>X1",
          "<NAME>SUPERMERCADO CENTRAL<MEMO>COMPRA PARCELADA 2/6</STMTTRN>",
          "</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>",
        ].join("\n"),
        "utf8",
      ),
      "teste.ofx",
    );

    expect(complementar.transactions[0].description).toBe(
      "SUPERMERCADO CENTRAL - COMPRA PARCELADA 2/6",
    );
  });

  it("identifica a conta declarada no arquivo", async () => {
    expect(result.accountHint).toBe("077 / 123456-7");
  });
});

describe("OFX 2.x (XML)", () => {
  let result: ParseResult;

  beforeAll(async () => {
    result = await parseStatement(
      fixture("extrato-ofx2-utf8.ofx"),
      "extrato-ofx2-utf8.ofx",
    );
  });

  it("extrai os lancamentos", async () => {
    expect(result.transactions).toHaveLength(3);
    expect(result.transactions[0].amountCents).toBe(1500000);
    expect(result.transactions[1].amountCents).toBe(-32045);
  });

  it("decodifica entidades XML na descricao", async () => {
    const fornecedor = result.transactions.find((t) => t.fitId === "A3");
    expect(fornecedor?.description).toContain("MOINHO & TRIGO");
    expect(fornecedor?.description).not.toContain("&amp;");
  });
});

describe("CSV com ponto e virgula", () => {
  let result: ParseResult;

  beforeAll(async () => {
    result = await parseStatement(
      fixture("extrato-csv-ponto-virgula.csv"),
      "extrato.csv",
    );
  });

  it("detecta o separador", async () => {
    expect(result.separator).toBe(";");
  });

  it("descarta cabecalho do banco, saldo anterior e rodape", async () => {
    // 6 linhas de dados no arquivo, mas "SALDO ANTERIOR" tem valor 0,00 e
    // as linhas de rodape nao tem data valida.
    expect(result.transactions).toHaveLength(5);
    expect(
      result.transactions.some((t) => t.description.includes("SALDO ANTERIOR")),
    ).toBe(false);
    expect(
      result.transactions.some((t) => t.description.includes("SALDO FINAL")),
    ).toBe(false);
  });

  it("entende sinal a direita e parenteses como negativo", async () => {
    const aluguel = result.transactions.find((t) => t.description.includes("ALUGUEL"));
    const tarifa = result.transactions.find((t) => t.description.includes("TARIFA"));

    expect(aluguel?.amountCents).toBe(-120050); // "1.200,50-"
    expect(tarifa?.amountCents).toBe(-4990); // "(49,90)"
  });

  it("nao confunde a coluna Saldo com a coluna Valor", async () => {
    const pix = result.transactions.find((t) => t.description.includes("PIX"));
    expect(pix?.amountCents).toBe(345000);
  });
});

describe("CSV com virgula e colunas de credito/debito", () => {
  let result: ParseResult;

  beforeAll(async () => {
    result = await parseStatement(fixture("extrato-csv-virgula.csv"), "extrato.csv");
  });

  it("detecta o separador mesmo com virgula dentro da descricao", async () => {
    expect(result.separator).toBe(",");
  });

  it("le descricao entre aspas contendo o separador", async () => {
    const venda = result.transactions.find((t) => t.description.includes("VENDA"));
    expect(venda?.description).toBe("VENDA CARTAO, PARCELA 1/3");
  });

  it("transforma credito em entrada e debito em saida", async () => {
    const venda = result.transactions.find((t) => t.description.includes("VENDA"));
    const energia = result.transactions.find((t) => t.description.includes("ENERGIA"));

    expect(venda?.amountCents).toBe(500000);
    expect(energia?.amountCents).toBe(-32045);
  });

  it("entende ano de dois digitos", async () => {
    expect(result.transactions[0].date.toISOString().slice(0, 10)).toBe("2026-08-02");
  });
});

describe("XLSX", () => {
  it("usa a primeira aba por padrao e lista as demais", async () => {
    const result = await parseStatement(fixture("extrato.xlsx"), "extrato.xlsx");
    expect(result.sheetNames).toEqual(["Resumo", "Lancamentos"]);
    expect(result.sheetName).toBe("Resumo");
  });

  it("le a aba escolhida", async () => {
    const result = await parseStatement(fixture("extrato.xlsx"), "extrato.xlsx", {
      sheetName: "Lancamentos",
    });

    expect(result.transactions).toHaveLength(4);
    expect(result.transactions[0].amountCents).toBe(500000);
    expect(result.transactions[1].amountCents).toBe(-32045);
  });

  it("ignora titulo antes da tabela e total no rodape", async () => {
    const result = await parseStatement(fixture("extrato.xlsx"), "extrato.xlsx", {
      sheetName: "Lancamentos",
    });

    expect(result.transactions.some((t) => t.description.includes("TOTAL"))).toBe(false);
    expect(result.transactions.some((t) => t.description.includes("Extrato"))).toBe(false);
  });
});

describe("limites da Secao 5.6", () => {
  it("recusa arquivo acima de 10 MB", async () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 0x41);
    await expect(parseStatement(big, "grande.csv")).rejects.toThrow(/10 MB/);
  });

  it("recusa arquivo vazio", async () => {
    await expect(parseStatement(Buffer.alloc(0), "vazio.csv")).rejects.toThrow(ParseError);
  });

  it("recusa formato desconhecido", async () => {
    await expect(parseStatement(Buffer.from("nada aqui"), "arquivo.bin")).rejects.toThrow(
      /Formato não reconhecido/,
    );
  });
});

describe("datas", () => {
  it.each([
    ["20/08/2026", "2026-08-20"],
    ["20/08/26", "2026-08-20"],
    ["2026-08-20", "2026-08-20"],
    ["20082026", "2026-08-20"],
    ["20.08.2026", "2026-08-20"],
    ["1/8/2026", "2026-08-01"],
  ])("interpreta %s como %s", (input, expected) => {
    expect(parseFlexibleDate(input)?.toISOString().slice(0, 10)).toBe(expected);
  });

  it("resolve ambiguidade como dd/mm, o padrao brasileiro", async () => {
    // 03/04 e 3 de abril, nao 4 de marco.
    expect(parseFlexibleDate("03/04/2026")?.toISOString().slice(0, 10)).toBe("2026-04-03");
  });

  it("cai para mm/dd apenas quando dd/mm e impossivel", async () => {
    expect(parseFlexibleDate("08/20/2026")?.toISOString().slice(0, 10)).toBe("2026-08-20");
  });

  it("recusa data inexistente", async () => {
    expect(parseFlexibleDate("31/02/2026")).toBeNull();
    expect(parseFlexibleDate("")).toBeNull();
    expect(parseFlexibleDate("SALDO")).toBeNull();
  });

  it("le a data do OFX com hora e fuso", async () => {
    expect(parseOfxDate("20260820120000[-3:BRT]")?.toISOString().slice(0, 10)).toBe(
      "2026-08-20",
    );
  });

  it("converte serial do Excel", async () => {
    expect(parseExcelSerial(46254)?.toISOString().slice(0, 10)).toBe("2026-08-20");
    // O Excel trata 1900 como bissexto; o epoch efetivo e 1899-12-30.
    expect(parseExcelSerial(1)?.toISOString().slice(0, 10)).toBe("1899-12-31");
  });
});

describe("separador do CSV", () => {
  it("escolhe ; quando a descricao tem virgulas", async () => {
    const text = [
      "Data;Historico;Valor",
      "01/08/2026;PAGTO FORNECEDOR, LTDA;100,00",
      "02/08/2026;COMPRA A, B e C;200,00",
    ].join("\n");

    expect(detectSeparator(text)).toBe(";");
  });

  it("escolhe , quando e esse o separador", async () => {
    const text = ["Data,Historico,Valor", "01/08/2026,PAGAMENTO,100.00"].join("\n");
    expect(detectSeparator(text)).toBe(",");
  });
});

describe("normalizacao e dedupe", () => {
  it("normaliza para comparacao sem perder o original", async () => {
    expect(normalizeDescription("Pix recebido  João  ")).toBe("PIX RECEBIDO JOAO");
    expect(normalizeDescription("TARIFA  MANUT   CONTA")).toBe("TARIFA MANUT CONTA");
  });

  it("gera o mesmo hash para descricoes equivalentes", async () => {
    const base = {
      accountId: "conta-1",
      date: new Date(Date.UTC(2026, 7, 20)),
      amountCents: -4990,
    };

    expect(dedupeHash({ ...base, description: "PIX RECEBIDO  JOÃO" })).toBe(
      dedupeHash({ ...base, description: "Pix recebido João" }),
    );
  });

  it("gera hash diferente quando algo muda de verdade", async () => {
    const base = {
      accountId: "conta-1",
      date: new Date(Date.UTC(2026, 7, 20)),
      amountCents: -4990,
      description: "TARIFA",
    };

    expect(dedupeHash(base)).not.toBe(dedupeHash({ ...base, amountCents: -4991 }));
    expect(dedupeHash(base)).not.toBe(dedupeHash({ ...base, accountId: "conta-2" }));
    expect(dedupeHash(base)).not.toBe(
      dedupeHash({ ...base, date: new Date(Date.UTC(2026, 7, 21)) }),
    );
  });
});

describe("reimportacao do mesmo arquivo", () => {
  it("produz exatamente os mesmos hashes (Secao 5.2)", async () => {
    const first = await parseStatement(
      fixture("extrato-csv-ponto-virgula.csv"),
      "extrato.csv",
    );
    const second = await parseStatement(
      fixture("extrato-csv-ponto-virgula.csv"),
      "extrato.csv",
    );

    const hashes = (result: typeof first) =>
      result.transactions.map((t) =>
        dedupeHash({
          accountId: "conta-1",
          date: t.date,
          amountCents: t.amountCents,
          description: t.description,
        }),
      );

    expect(hashes(first)).toEqual(hashes(second));
  });
});
