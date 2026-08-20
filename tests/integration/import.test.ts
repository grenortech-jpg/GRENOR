import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildDedupeKeys, splitDuplicates } from "@/lib/import/dedupe";
import { parseStatement } from "@/lib/import/parse";
import {
  buildStoragePath,
  downloadStatement,
  removeStatement,
  uploadStatement,
} from "@/lib/import/storage";
import { prisma } from "@/lib/prisma";

/**
 * Importacao ponta a ponta contra o banco e o Storage reais.
 *
 * O que esta suite protege e a promessa da Secao 5.2: reimportar o mesmo
 * arquivo NUNCA duplica. E o tipo de defeito que so aparece em producao, no
 * fechamento do mes, com o numero errado ja no relatorio do cliente.
 */

const FIXTURES = join(process.cwd(), "tests", "fixtures");
const fixture = (name: string) => readFileSync(join(FIXTURES, name));

const SUFFIX = "import-test";

let workspaceId: string;
let companyId: string;
let accountId: string;

async function importFile(name: string, options: { sheetName?: string } = {}) {
  const parsed = parseStatement(fixture(name), name, options);

  const batch = await prisma.importBatch.create({
    data: {
      accountId,
      fileName: name,
      fileType: parsed.fileType,
      status: "PARSED",
      rowsTotal: parsed.transactions.length,
    },
  });

  const keyed = buildDedupeKeys(accountId, parsed.transactions);
  const existing = await prisma.transaction.findMany({
    where: { accountId },
    select: { fitId: true, dedupeHash: true },
  });

  const { fresh, duplicates } = splitDuplicates(keyed, existing);

  if (fresh.length > 0) {
    await prisma.transaction.createMany({
      data: fresh.map((transaction) => ({
        accountId,
        importBatchId: batch.id,
        date: transaction.date,
        description: transaction.description,
        amountCents: transaction.amountCents,
        fitId: transaction.fitId ?? null,
        dedupeHash: transaction.dedupeHash,
        categorizedBy: "NONE" as const,
      })),
      skipDuplicates: true,
    });
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      status: "CONFIRMED",
      rowsImported: fresh.length,
      rowsDuplicated: duplicates.length,
      confirmedAt: new Date(),
    },
  });

  return { parsed, imported: fresh.length, duplicated: duplicates.length };
}

beforeAll(async () => {
  await prisma.workspace.deleteMany({ where: { slug: { endsWith: SUFFIX } } });

  const workspace = await prisma.workspace.create({
    data: { name: "Importacao", slug: `ws-${SUFFIX}` },
  });
  workspaceId = workspace.id;

  const company = await prisma.company.create({
    data: { workspaceId, name: "Empresa de Importacao" },
  });
  companyId = company.id;

  const account = await prisma.bankAccount.create({
    data: {
      companyId,
      bankName: "Inter",
      nickname: "Conta movimento",
      openingBalanceCents: 5_000_000,
      openingBalanceDate: new Date(Date.UTC(2026, 7, 1)),
    },
  });
  accountId = account.id;
}, 60_000);

afterAll(async () => {
  await prisma.workspace.deleteMany({ where: { slug: { endsWith: SUFFIX } } });
  await prisma.$disconnect();
}, 60_000);

describe("primeira importacao", () => {
  it("grava os lancamentos do OFX", async () => {
    const result = await importFile("extrato-ofx1-latin1.ofx");

    expect(result.imported).toBe(5);
    expect(result.duplicated).toBe(0);

    const count = await prisma.transaction.count({ where: { accountId } });
    expect(count).toBe(5);
  });

  it("preserva a descricao original com acentos", async () => {
    const transaction = await prisma.transaction.findFirst({
      where: { accountId, fitId: "2026081200004" },
    });

    expect(transaction?.description).toContain("PADARIA PAO & CIA");
  });

  it("guarda o sinal correto", async () => {
    const saidas = await prisma.transaction.count({
      where: { accountId, amountCents: { lt: 0 } },
    });
    const entradas = await prisma.transaction.count({
      where: { accountId, amountCents: { gt: 0 } },
    });

    expect(saidas).toBe(3);
    expect(entradas).toBe(2);
  });
});

describe("reimportacao do mesmo arquivo (Secao 5.2)", () => {
  it("nao duplica nada", async () => {
    const before = await prisma.transaction.count({ where: { accountId } });

    const result = await importFile("extrato-ofx1-latin1.ofx");

    expect(result.imported).toBe(0);
    expect(result.duplicated).toBe(5);

    const after = await prisma.transaction.count({ where: { accountId } });
    expect(after).toBe(before);
  });

  it("conta as duplicatas no lote, para o resumo", async () => {
    const batches = await prisma.importBatch.findMany({
      where: { accountId, fileName: "extrato-ofx1-latin1.ofx" },
      orderBy: { createdAt: "asc" },
    });

    expect(batches[0].rowsImported).toBe(5);
    expect(batches[1].rowsImported).toBe(0);
    expect(batches[1].rowsDuplicated).toBe(5);
  });
});

describe("mesmo extrato em formato diferente", () => {
  it("reconhece como duplicata pelo hash, mesmo sem FITID", async () => {
    // O CSV tem os mesmos 5 lancamentos do OFX, mas sem FITID. A deduplicacao
    // por dedupeHash precisa alcancar isso, senao o usuario que exporta nos
    // dois formatos dobra o extrato.
    const result = await importFile("extrato-csv-ponto-virgula.csv");

    expect(result.imported).toBe(0);
    expect(result.duplicated).toBe(5);
  });
});

describe("repeticoes legitimas", () => {
  it("mantem duas transacoes identicas do mesmo dia", async () => {
    // Duas tarifas iguais no mesmo dia sao dois lancamentos reais, nao uma
    // duplicata. O hash carrega a ordem de ocorrencia para nao perder a segunda.
    const csv = [
      "Data;Historico;Valor",
      "05/09/2026;TARIFA PIX;-1,90",
      "05/09/2026;TARIFA PIX;-1,90",
      "05/09/2026;TARIFA PIX;-1,90",
    ].join("\n");

    const parsed = parseStatement(Buffer.from(csv, "utf8"), "tarifas.csv");
    expect(parsed.transactions).toHaveLength(3);

    const keyed = buildDedupeKeys(accountId, parsed.transactions);
    expect(new Set(keyed.map((row) => row.dedupeHash)).size).toBe(3);

    const existing = await prisma.transaction.findMany({
      where: { accountId },
      select: { fitId: true, dedupeHash: true },
    });
    const { fresh } = splitDuplicates(keyed, existing);
    expect(fresh).toHaveLength(3);

    await prisma.transaction.createMany({
      data: fresh.map((transaction) => ({
        accountId,
        date: transaction.date,
        description: transaction.description,
        amountCents: transaction.amountCents,
        dedupeHash: transaction.dedupeHash,
        categorizedBy: "NONE" as const,
      })),
    });

    const tarifas = await prisma.transaction.count({
      where: { accountId, description: "TARIFA PIX" },
    });
    expect(tarifas).toBe(3);
  });

  it("e mesmo assim nao duplica na reimportacao", async () => {
    const csv = [
      "Data;Historico;Valor",
      "05/09/2026;TARIFA PIX;-1,90",
      "05/09/2026;TARIFA PIX;-1,90",
      "05/09/2026;TARIFA PIX;-1,90",
    ].join("\n");

    const parsed = parseStatement(Buffer.from(csv, "utf8"), "tarifas.csv");
    const keyed = buildDedupeKeys(accountId, parsed.transactions);

    const existing = await prisma.transaction.findMany({
      where: { accountId },
      select: { fitId: true, dedupeHash: true },
    });
    const { fresh, duplicates } = splitDuplicates(keyed, existing);

    expect(fresh).toHaveLength(0);
    expect(duplicates).toHaveLength(3);
  });
});

describe("outra conta da mesma empresa", () => {
  it("importa o mesmo arquivo sem colidir", async () => {
    // O dedupeHash inclui o accountId: o mesmo extrato em outra conta e
    // outro conjunto de lancamentos.
    const other = await prisma.bankAccount.create({
      data: {
        companyId,
        bankName: "Itau",
        nickname: "Segunda conta",
        openingBalanceCents: 0,
        openingBalanceDate: new Date(Date.UTC(2026, 7, 1)),
      },
    });

    const parsed = parseStatement(
      fixture("extrato-ofx1-latin1.ofx"),
      "extrato-ofx1-latin1.ofx",
    );
    const keyed = buildDedupeKeys(other.id, parsed.transactions);

    const existing = await prisma.transaction.findMany({
      where: { accountId: other.id },
      select: { fitId: true, dedupeHash: true },
    });
    const { fresh } = splitDuplicates(keyed, existing);

    expect(fresh).toHaveLength(5);
  });
});

describe("Storage", () => {
  it("guarda e recupera o arquivo original", async () => {
    const original = fixture("extrato-ofx2-utf8.ofx");
    const path = buildStoragePath({
      workspaceId,
      companyId,
      accountId,
      importBatchId: crypto.randomUUID(),
      fileName: "extrato-ofx2-utf8.ofx",
    });

    await uploadStatement(path, original, "application/octet-stream");
    const recovered = await downloadStatement(path);

    expect(recovered.equals(original)).toBe(true);

    await removeStatement(path);
  }, 30_000);

  it("organiza o caminho por workspace, empresa e conta", () => {
    const path = buildStoragePath({
      workspaceId: "ws",
      companyId: "co",
      accountId: "ac",
      importBatchId: "batch",
      fileName: "Extrato Agosto.OFX",
    });

    expect(path).toBe("ws/co/ac/batch.ofx");
  });
});
