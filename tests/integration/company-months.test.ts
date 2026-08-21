import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listCompanyMonths } from "@/lib/companies/months";
import { dedupeHash } from "@/lib/import/normalize";
import { prisma } from "@/lib/prisma";

/**
 * Historico de meses de uma empresa (Fase 8).
 *
 * Esta suite existe por dois motivos.
 *
 * O primeiro e o unico `$queryRaw` do projeto: SQL escrito a mao nao passa
 * pelo verificador de tipos do Prisma, entao um erro de coluna ou de cast so
 * aparece em execucao. Os testes de contagem abaixo sao o que substitui o
 * compilador aqui.
 *
 * O segundo e a Secao 3: a consulta recebe workspaceId e precisa honra-lo. Uma
 * clausula esquecida ali entregaria o historico de uma empresa a outro
 * escritorio.
 *
 * Roda contra o banco real: `npm run test:db`.
 */

type Fixture = {
  workspaceId: string;
  companyId: string;
  accountId: string;
};

const SUFFIX = process.env.TEST_RUN_ID ?? "months";

async function createFixture(label: string): Promise<Fixture> {
  const workspace = await prisma.workspace.create({
    data: { name: `Meses ${label}`, slug: `meses-${label}-${SUFFIX}` },
  });

  const company = await prisma.company.create({
    data: { workspaceId: workspace.id, name: `Empresa ${label}` },
  });

  const account = await prisma.bankAccount.create({
    data: {
      companyId: company.id,
      bankName: "Banco Teste",
      nickname: `Conta ${label}`,
      openingBalanceCents: 0,
      openingBalanceDate: new Date(Date.UTC(2025, 11, 31)),
    },
  });

  return {
    workspaceId: workspace.id,
    companyId: company.id,
    accountId: account.id,
  };
}

async function addTransaction(params: {
  accountId: string;
  year: number;
  month: number;
  day: number;
  amountCents: number;
  description: string;
  categoryId?: string;
}) {
  const date = new Date(Date.UTC(params.year, params.month - 1, params.day));

  await prisma.transaction.create({
    data: {
      accountId: params.accountId,
      date,
      description: params.description,
      amountCents: params.amountCents,
      dedupeHash: dedupeHash({
        accountId: params.accountId,
        date,
        amountCents: params.amountCents,
        description: params.description,
      }),
      categoryId: params.categoryId ?? null,
      categorizedBy: params.categoryId ? "MANUAL" : "NONE",
    },
  });
}

let alpha: Fixture;
let beta: Fixture;
let alphaCategoryId: string;

beforeAll(async () => {
  await prisma.workspace.deleteMany({ where: { slug: { endsWith: SUFFIX } } });

  alpha = await createFixture("alpha");
  beta = await createFixture("beta");

  const category = await prisma.category.create({
    data: {
      workspaceId: alpha.workspaceId,
      name: "Receita alpha",
      group: "REVENUE",
      sortOrder: 10,
    },
  });
  alphaCategoryId = category.id;

  // Marco: dois lancamentos, ambos categorizados.
  await addTransaction({
    accountId: alpha.accountId,
    year: 2026,
    month: 3,
    day: 5,
    amountCents: 10_000,
    description: "VENDA MARCO A",
    categoryId: alphaCategoryId,
  });
  await addTransaction({
    accountId: alpha.accountId,
    year: 2026,
    month: 3,
    day: 20,
    amountCents: 25_000,
    description: "VENDA MARCO B",
    categoryId: alphaCategoryId,
  });

  // Abril: tres lancamentos, um sem categoria.
  await addTransaction({
    accountId: alpha.accountId,
    year: 2026,
    month: 4,
    day: 2,
    amountCents: 30_000,
    description: "VENDA ABRIL A",
    categoryId: alphaCategoryId,
  });
  await addTransaction({
    accountId: alpha.accountId,
    year: 2026,
    month: 4,
    day: 11,
    amountCents: -5_000,
    description: "TARIFA ABRIL",
    categoryId: alphaCategoryId,
  });
  await addTransaction({
    accountId: alpha.accountId,
    year: 2026,
    month: 4,
    day: 28,
    amountCents: -1_200,
    description: "PENDENTE ABRIL",
  });

  // Beta movimenta um mes que alpha nao tem, para o vazamento ficar visivel.
  await addTransaction({
    accountId: beta.accountId,
    year: 2026,
    month: 9,
    day: 9,
    amountCents: 99_000,
    description: "VENDA BETA SETEMBRO",
  });

  // Marco fechado; abril nunca foi fechado e portanto nao tem Period.
  await prisma.period.create({
    data: {
      companyId: alpha.companyId,
      year: 2026,
      month: 3,
      status: "CLOSED",
      closedAt: new Date(),
    },
  });
}, 60_000);

afterAll(async () => {
  await prisma.workspace.deleteMany({ where: { slug: { endsWith: SUFFIX } } });
  await prisma.$disconnect();
}, 60_000);

describe("historico de meses", () => {
  it("lista os meses que tem lancamento", async () => {
    const months = await listCompanyMonths({
      companyId: alpha.companyId,
      workspaceId: alpha.workspaceId,
    });

    expect(months).toHaveLength(2);
  });

  it("devolve do mais recente para o mais antigo", async () => {
    const months = await listCompanyMonths({
      companyId: alpha.companyId,
      workspaceId: alpha.workspaceId,
    });

    expect(months.map((m) => `${m.year}-${m.month}`)).toEqual([
      "2026-4",
      "2026-3",
    ]);
  });

  it("conta os lancamentos de cada mes", async () => {
    const months = await listCompanyMonths({
      companyId: alpha.companyId,
      workspaceId: alpha.workspaceId,
    });

    expect(months.find((m) => m.month === 3)?.total).toBe(2);
    expect(months.find((m) => m.month === 4)?.total).toBe(3);
  });

  it("conta separadamente o que esta sem categoria", async () => {
    // E o que decide se a linha leva a conciliacao ou ao relatorio.
    const months = await listCompanyMonths({
      companyId: alpha.companyId,
      workspaceId: alpha.workspaceId,
    });

    expect(months.find((m) => m.month === 3)?.pending).toBe(0);
    expect(months.find((m) => m.month === 4)?.pending).toBe(1);
  });

  it("devolve numero, nao BigInt", async () => {
    // COUNT(*) do Postgres volta como BigInt sem o cast ::int, e BigInt quebra
    // a serializacao do React Server Component.
    const months = await listCompanyMonths({
      companyId: alpha.companyId,
      workspaceId: alpha.workspaceId,
    });

    expect(typeof months[0].total).toBe("number");
    expect(typeof months[0].year).toBe("number");
    expect(typeof months[0].month).toBe("number");
  });
});

describe("status do mes", () => {
  it("marca CLOSED o mes que foi fechado", async () => {
    const months = await listCompanyMonths({
      companyId: alpha.companyId,
      workspaceId: alpha.workspaceId,
    });

    expect(months.find((m) => m.month === 3)?.status).toBe("CLOSED");
  });

  it("mes com lancamento e sem Period tem status nulo", async () => {
    // O defeito que originou este modulo: a tabela Period so ganha linha no
    // fechamento, entao um mes importado e nunca fechado nao existia na tela.
    const months = await listCompanyMonths({
      companyId: alpha.companyId,
      workspaceId: alpha.workspaceId,
    });

    const abril = months.find((m) => m.month === 4);

    expect(abril).toBeDefined();
    expect(abril?.status).toBeNull();
  });
});

describe("isolamento entre workspaces (Secao 3)", () => {
  it("empresa alheia nao devolve mes nenhum", async () => {
    const months = await listCompanyMonths({
      companyId: alpha.companyId,
      workspaceId: beta.workspaceId,
    });

    expect(months).toEqual([]);
  });

  it("nega nos dois sentidos", async () => {
    const months = await listCompanyMonths({
      companyId: beta.companyId,
      workspaceId: alpha.workspaceId,
    });

    expect(months).toEqual([]);
  });

  it("o mes de beta nunca aparece no historico de alpha", async () => {
    const months = await listCompanyMonths({
      companyId: alpha.companyId,
      workspaceId: alpha.workspaceId,
    });

    expect(months.some((m) => m.month === 9)).toBe(false);
  });

  it("workspace inexistente devolve vazio, nao erro", async () => {
    const months = await listCompanyMonths({
      companyId: alpha.companyId,
      workspaceId: "00000000-0000-4000-8000-000000000000",
    });

    expect(months).toEqual([]);
  });
});

describe("empresa sem movimento", () => {
  it("devolve lista vazia em vez de falhar", async () => {
    const vazia = await prisma.company.create({
      data: { workspaceId: alpha.workspaceId, name: "Sem lançamentos" },
    });

    const months = await listCompanyMonths({
      companyId: vazia.id,
      workspaceId: alpha.workspaceId,
    });

    expect(months).toEqual([]);
  });
});
