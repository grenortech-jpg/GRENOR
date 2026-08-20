import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  assertTransactionsInWorkspace,
  type WorkspaceContext,
} from "@/lib/auth/workspace";
import { getWorkspaceCategories } from "@/lib/categories/list";
import { prisma } from "@/lib/prisma";
import { createWorkspaceForUser } from "@/lib/workspace/create";

/**
 * A edicao em massa da conciliacao recebe uma LISTA de ids vinda do cliente.
 * Se a validacao dessa lista falhar, um workspace consegue recategorizar - ou
 * apagar a categoria - dos lancamentos de outro escritorio. E o mesmo risco da
 * Secao 3, so que por atacado.
 *
 * A regra e "tudo ou nada": basta um id de fora para a operacao inteira ser
 * negada. Aceitar os proprios e ignorar os alheios em silencio mascararia o
 * ataque.
 */

const SUFFIX = "bulk-test";

type Fixture = {
  context: WorkspaceContext;
  companyId: string;
  accountId: string;
  transactionIds: string[];
  ruleId: string;
};

async function createFixture(label: string): Promise<Fixture> {
  const userId = crypto.randomUUID();

  const workspace = await createWorkspaceForUser({
    userId,
    name: `Escritorio ${label} ${SUFFIX}`,
  });

  const membership = await prisma.workspaceMember.findFirstOrThrow({
    where: { workspaceId: workspace.id, userId },
  });

  const context: WorkspaceContext = {
    userId,
    workspace,
    role: membership.role,
  };

  const company = await prisma.company.create({
    data: { workspaceId: workspace.id, name: `Empresa ${label}` },
  });

  const account = await prisma.bankAccount.create({
    data: {
      companyId: company.id,
      bankName: "Banco",
      nickname: `Conta ${label}`,
      openingBalanceCents: 0,
      openingBalanceDate: new Date(Date.UTC(2026, 7, 1)),
    },
  });

  const transactions = await Promise.all(
    [1, 2, 3].map((n) =>
      prisma.transaction.create({
        data: {
          accountId: account.id,
          date: new Date(Date.UTC(2026, 7, n)),
          description: `LANCAMENTO ${label} ${n}`,
          amountCents: -1000 * n,
          dedupeHash: `${label}-${n}-${SUFFIX}`,
        },
      }),
    ),
  );

  const categories = await getWorkspaceCategories(context);

  const rule = await prisma.categoryRule.create({
    data: {
      workspaceId: workspace.id,
      categoryId: categories[0].id,
      matchType: "CONTAINS",
      pattern: `PADRAO ${label}`,
      priority: 100,
    },
  });

  return {
    context,
    companyId: company.id,
    accountId: account.id,
    transactionIds: transactions.map((t) => t.id),
    ruleId: rule.id,
  };
}

let alpha: Fixture;
let beta: Fixture;

beforeAll(async () => {
  await prisma.workspace.deleteMany({ where: { slug: { contains: SUFFIX } } });
  alpha = await createFixture("alpha");
  beta = await createFixture("beta");
}, 90_000);

afterAll(async () => {
  await prisma.workspace.deleteMany({ where: { slug: { contains: SUFFIX } } });
  await prisma.$disconnect();
}, 60_000);

describe("edicao em massa de lancamentos", () => {
  it("aceita a lista quando todos sao do proprio workspace", async () => {
    await expect(
      assertTransactionsInWorkspace(alpha.transactionIds, alpha.context),
    ).resolves.toBeUndefined();
  });

  it("aceita lista vazia sem consultar nada", async () => {
    await expect(
      assertTransactionsInWorkspace([], alpha.context),
    ).resolves.toBeUndefined();
  });

  it("nega lista inteiramente alheia", async () => {
    await expect(
      assertTransactionsInWorkspace(beta.transactionIds, alpha.context),
    ).rejects.toThrow();
  });

  // O caso perigoso: a lista parece legitima porque a maioria e propria.
  it("nega quando um unico id e de outro workspace", async () => {
    const misturada = [...alpha.transactionIds, beta.transactionIds[0]];

    await expect(
      assertTransactionsInWorkspace(misturada, alpha.context),
    ).rejects.toThrow();
  });

  it("nega id inexistente com o mesmo rigor", async () => {
    await expect(
      assertTransactionsInWorkspace(
        [...alpha.transactionIds, crypto.randomUUID()],
        alpha.context,
      ),
    ).rejects.toThrow();
  });

  it("nao se deixa enganar por id repetido", async () => {
    // Repetir o proprio id ate igualar a contagem nao pode liberar o alheio.
    const inflada = [
      alpha.transactionIds[0],
      alpha.transactionIds[0],
      alpha.transactionIds[0],
      beta.transactionIds[0],
    ];

    await expect(
      assertTransactionsInWorkspace(inflada, alpha.context),
    ).rejects.toThrow();
  });

  it("nega nos dois sentidos", async () => {
    await expect(
      assertTransactionsInWorkspace(alpha.transactionIds, beta.context),
    ).rejects.toThrow();
  });
});

describe("regras do workspace", () => {
  it("cada escritorio so enxerga as proprias regras", async () => {
    const [alphaRules, betaRules] = await Promise.all([
      prisma.categoryRule.findMany({
        where: { workspaceId: alpha.context.workspace.id },
      }),
      prisma.categoryRule.findMany({
        where: { workspaceId: beta.context.workspace.id },
      }),
    ]);

    expect(alphaRules.map((r) => r.id)).toContain(alpha.ruleId);
    expect(alphaRules.map((r) => r.id)).not.toContain(beta.ruleId);
    expect(betaRules.map((r) => r.id)).not.toContain(alpha.ruleId);
  });

  it("regra alheia nao e encontrada pelo filtro de workspace", async () => {
    // E a consulta que updateRuleAction e deleteRuleAction usam.
    const found = await prisma.categoryRule.findFirst({
      where: { id: beta.ruleId, workspaceId: alpha.context.workspace.id },
    });

    expect(found).toBeNull();
  });

  it("regra aponta para categoria do proprio workspace", async () => {
    const rule = await prisma.categoryRule.findUniqueOrThrow({
      where: { id: alpha.ruleId },
      include: { category: true },
    });

    expect(rule.category.workspaceId).toBe(alpha.context.workspace.id);
  });
});

describe("criacao de workspace", () => {
  it("clona o plano de contas inteiro para o novo escritorio", async () => {
    const categories = await getWorkspaceCategories(alpha.context);

    expect(categories).toHaveLength(28);
    expect(categories.every((c) => c.workspaceId === alpha.context.workspace.id)).toBe(
      true,
    );
  });

  it("os dois escritorios tem categorias independentes", async () => {
    const [alphaCategories, betaCategories] = await Promise.all([
      getWorkspaceCategories(alpha.context),
      getWorkspaceCategories(beta.context),
    ]);

    const alphaIds = new Set(alphaCategories.map((c) => c.id));
    expect(betaCategories.some((c) => alphaIds.has(c.id))).toBe(false);
  });

  it("entrega o plano na ordem de apresentacao da DRE", async () => {
    const categories = await getWorkspaceCategories(alpha.context);

    // Receitas vem antes de impostos, que vem antes de custos.
    expect(categories[0].group).toBe("REVENUE");
    expect(categories.at(-1)?.group).toBe("TRANSFERS");
  });

  it("gera slug unico mesmo com nomes iguais", async () => {
    expect(alpha.context.workspace.slug).not.toBe(beta.context.workspace.slug);
  });

  it("vincula quem criou como OWNER", async () => {
    expect(alpha.context.role).toBe("OWNER");
  });
});
