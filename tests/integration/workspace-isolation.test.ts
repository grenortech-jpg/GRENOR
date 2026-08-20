import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  assertAccountInWorkspace,
  assertCategoryInWorkspace,
  assertCompanyInWorkspace,
  assertPeriodInWorkspace,
  type WorkspaceContext,
} from "@/lib/auth/workspace";
import { listCompanyOverviews } from "@/lib/companies/overview";
import { prisma } from "@/lib/prisma";

/**
 * Vazamento entre clientes e o pior defeito possivel neste produto (Secao 3).
 *
 * Esta suite monta dois escritorios completos e independentes e tenta, de
 * todas as formas, alcancar recurso do outro. Toda tentativa precisa falhar.
 *
 * Roda contra o banco real: `npm run test:db`.
 */

type Fixture = {
  context: WorkspaceContext;
  companyId: string;
  accountId: string;
  periodId: string;
  categoryId: string;
};

const SUFFIX = process.env.TEST_RUN_ID ?? "isolation";

async function createFixture(label: string): Promise<Fixture> {
  const userId = crypto.randomUUID();

  const workspace = await prisma.workspace.create({
    data: { name: `Teste ${label}`, slug: `teste-${label}-${SUFFIX}` },
  });

  const [membership, company, category] = await Promise.all([
    prisma.workspaceMember.create({
      data: { workspaceId: workspace.id, userId, role: "OWNER" },
    }),
    prisma.company.create({
      data: { workspaceId: workspace.id, name: `Empresa ${label}` },
    }),
    prisma.category.create({
      data: {
        workspaceId: workspace.id,
        name: `Categoria ${label}`,
        group: "REVENUE",
        sortOrder: 10,
      },
    }),
  ]);

  const account = await prisma.bankAccount.create({
    data: {
      companyId: company.id,
      bankName: "Banco Teste",
      nickname: `Conta ${label}`,
      openingBalanceCents: 100_000,
      openingBalanceDate: new Date(Date.UTC(2026, 0, 1)),
    },
  });

  const period = await prisma.period.create({
    data: { companyId: company.id, year: 2026, month: 1 },
  });

  return {
    context: { userId, workspace, role: membership.role },
    companyId: company.id,
    accountId: account.id,
    periodId: period.id,
    categoryId: category.id,
  };
}

let alpha: Fixture;
let beta: Fixture;

beforeAll(async () => {
  await prisma.workspace.deleteMany({ where: { slug: { endsWith: SUFFIX } } });
  alpha = await createFixture("alpha");
  beta = await createFixture("beta");
}, 60_000);

afterAll(async () => {
  await prisma.workspace.deleteMany({ where: { slug: { endsWith: SUFFIX } } });
  await prisma.$disconnect();
}, 60_000);

describe("acesso ao proprio workspace", () => {
  it("encontra a propria empresa", async () => {
    const company = await assertCompanyInWorkspace(alpha.companyId, alpha.context);
    expect(company.id).toBe(alpha.companyId);
  });

  it("encontra a propria conta", async () => {
    const account = await assertAccountInWorkspace(alpha.accountId, alpha.context);
    expect(account.id).toBe(alpha.accountId);
  });

  it("encontra o proprio periodo", async () => {
    const period = await assertPeriodInWorkspace(alpha.periodId, alpha.context);
    expect(period.id).toBe(alpha.periodId);
  });

  it("encontra a propria categoria", async () => {
    const category = await assertCategoryInWorkspace(
      alpha.categoryId,
      alpha.context,
    );
    expect(category.id).toBe(alpha.categoryId);
  });
});

describe("acesso a recurso de outro workspace", () => {
  it("nega empresa alheia", async () => {
    await expect(
      assertCompanyInWorkspace(beta.companyId, alpha.context),
    ).rejects.toThrow();
  });

  it("nega conta alheia", async () => {
    await expect(
      assertAccountInWorkspace(beta.accountId, alpha.context),
    ).rejects.toThrow();
  });

  it("nega periodo alheio", async () => {
    await expect(
      assertPeriodInWorkspace(beta.periodId, alpha.context),
    ).rejects.toThrow();
  });

  it("nega categoria alheia", async () => {
    await expect(
      assertCategoryInWorkspace(beta.categoryId, alpha.context),
    ).rejects.toThrow();
  });

  // Simetria: o erro nao pode depender de qual workspace foi criado primeiro.
  it("nega nos dois sentidos", async () => {
    await expect(
      assertCompanyInWorkspace(alpha.companyId, beta.context),
    ).rejects.toThrow();
    await expect(
      assertAccountInWorkspace(alpha.accountId, beta.context),
    ).rejects.toThrow();
  });

  it("nega id inexistente do mesmo jeito que id alheio", async () => {
    await expect(
      assertCompanyInWorkspace(crypto.randomUUID(), alpha.context),
    ).rejects.toThrow();
  });
});

describe("listagens", () => {
  it("so devolve empresas do proprio workspace", async () => {
    const overviews = await listCompanyOverviews(alpha.context);
    const ids = overviews.map((company) => company.id);

    expect(ids).toContain(alpha.companyId);
    expect(ids).not.toContain(beta.companyId);
  });

  it("a busca nao vaza empresa de outro workspace", async () => {
    const overviews = await listCompanyOverviews(alpha.context, {
      search: "Empresa beta",
    });

    expect(overviews.map((company) => company.id)).not.toContain(beta.companyId);
  });
});

describe("integridade dos dados do tenant", () => {
  it("cada workspace enxerga apenas as proprias categorias", async () => {
    const [alphaCategories, betaCategories] = await Promise.all([
      prisma.category.findMany({
        where: { workspaceId: alpha.context.workspace.id },
      }),
      prisma.category.findMany({
        where: { workspaceId: beta.context.workspace.id },
      }),
    ]);

    const alphaIds = new Set(alphaCategories.map((category) => category.id));
    for (const category of betaCategories) {
      expect(alphaIds.has(category.id)).toBe(false);
    }
  });

  it("excluir a empresa leva junto contas e periodos", async () => {
    const gamma = await createFixture("gamma");

    await prisma.company.delete({ where: { id: gamma.companyId } });

    const [account, period] = await Promise.all([
      prisma.bankAccount.findUnique({ where: { id: gamma.accountId } }),
      prisma.period.findUnique({ where: { id: gamma.periodId } }),
    ]);

    expect(account).toBeNull();
    expect(period).toBeNull();

    await prisma.workspace.delete({ where: { id: gamma.context.workspace.id } });
  });
});
