import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDemoCompany } from "@/lib/demo/create";
import { prisma } from "@/lib/prisma";

/**
 * Rota de ingestao por e-mail e empresa de demonstracao, contra o banco e o
 * Storage reais (Fase 12). Chama o handler diretamente, com o mesmo Request
 * multipart que o Worker do Cloudflare monta.
 */

process.env.INBOUND_EMAIL_SECRET = "segredo-de-teste";

const { POST } = await import("@/app/api/inbound/email/route");

const SUFFIX = "inbound-test";
const TOKEN = "feedfacefeedfacefeed";
const FIXTURE = readFileSync(join(process.cwd(), "tests", "fixtures", "extrato-csv-ponto-virgula.csv"));

let workspaceId: string;
let companyId: string;

function request(fields: Record<string, string>, files: { name: string; body: Buffer }[] = [{ name: "extrato.csv", body: FIXTURE }], secret = "segredo-de-teste") {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  for (const file of files) form.append("attachments", new Blob([new Uint8Array(file.body)], { type: "text/csv" }), file.name);
  return new Request("http://localhost/api/inbound/email", {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    body: form,
  });
}

// O handler tipa o parametro como NextRequest; em runtime um Request serve.
const post = (req: Request) => POST(req as never);

beforeAll(async () => {
  await prisma.workspace.deleteMany({ where: { slug: { endsWith: SUFFIX } } });
  const workspace = await prisma.workspace.create({ data: { name: "Inbound", slug: `ws-${SUFFIX}` } });
  workspaceId = workspace.id;
  const company = await prisma.company.create({
    data: {
      workspaceId,
      name: "Empresa por e-mail",
      inboundToken: TOKEN,
      inboundEnabled: true,
      inboundSenders: ["extrato@banco.com.br"],
      accounts: {
        create: { bankName: "Inter", nickname: "Conta corrente", openingBalanceCents: 0, openingBalanceDate: new Date("2026-07-31") },
      },
    },
  });
  companyId = company.id;
}, 60_000);

afterAll(async () => {
  await prisma.workspace.deleteMany({ where: { slug: { endsWith: SUFFIX } } });
  await prisma.$disconnect();
}, 60_000);

describe("rota de e-mail", () => {
  it("recusa sem o segredo", async () => {
    const res = await post(request({ to: `${TOKEN}@x.test`, from: "extrato@banco.com.br" }, undefined, "errado"));
    expect(res.status).toBe(401);
  });

  it("recusa endereco desconhecido e remetente fora da lista", async () => {
    expect((await post(request({ to: "00000000000000000000@x.test", from: "extrato@banco.com.br" }))).status).toBe(404);
    expect((await post(request({ to: `${TOKEN}@x.test`, from: "intruso@evil.test" }))).status).toBe(403);
    expect(await prisma.transaction.count({ where: { account: { companyId } } })).toBe(0);
  });

  it("importa o anexo e nao duplica na segunda mensagem", async () => {
    const first = await post(request({ to: `Finort <${TOKEN}@x.test>`, from: "Banco <EXTRATO@banco.com.br>", subject: "Extrato" }));
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(body.results[0].ok).toBe(true);
    expect(body.results[0].rowsImported).toBeGreaterThan(0);

    const total = await prisma.transaction.count({ where: { account: { companyId } } });
    expect(total).toBe(body.results[0].rowsImported);

    const second = await post(request({ to: `${TOKEN}@x.test`, from: "extrato@banco.com.br" }));
    const again = await second.json();
    expect(again.results[0].rowsImported).toBe(0);
    expect(again.results[0].rowsDuplicated).toBe(total);

    const batches = await prisma.importBatch.findMany({ where: { account: { companyId } } });
    expect(batches.every((b) => b.source === "EMAIL" && b.status === "CONFIRMED")).toBe(true);
    expect(batches[0].senderEmail).toContain("banco.com.br");
  });

  it("empresa com varias contas exige a tag da conta", async () => {
    await prisma.bankAccount.create({
      data: { companyId, bankName: "Itaú", nickname: "Poupança", openingBalanceCents: 0, openingBalanceDate: new Date("2026-07-31") },
    });
    const ambiguous = await post(request({ to: `${TOKEN}@x.test`, from: "extrato@banco.com.br" }));
    expect(ambiguous.status).toBe(422);

    const tagged = await post(request({ to: `${TOKEN}+poupanca@x.test`, from: "extrato@banco.com.br" }));
    expect(tagged.status).toBe(200);
    expect((await tagged.json()).account).toBe("Poupança");
  });
});

describe("empresa de demonstracao", () => {
  it("cria tres meses categorizados e recria sem duplicar", async () => {
    const first = await createDemoCompany(prisma, workspaceId).catch((e) => e);
    // O workspace de teste nao tem o plano clonado: a demo usa as categorias do sistema.
    expect(first).not.toBeInstanceOf(Error);
    expect(first.months).toHaveLength(3);
    expect(first.transactions).toBeGreaterThan(100);

    const second = await createDemoCompany(prisma, workspaceId);
    expect(second.replaced).toBe(true);
    expect(await prisma.company.count({ where: { workspaceId, cnpj: "11222333000181" } })).toBe(1);
  }, 60_000);
});
