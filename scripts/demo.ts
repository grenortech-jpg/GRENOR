import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { dedupeHash } from "../src/lib/import/normalize";

/**
 * Empresa de demonstracao com tres meses de dados realistas (Fase 8).
 *
 *   npm run db:demo -- [slug-do-workspace]
 *
 * Serve para demonstrar o produto a um prospect sem subir extrato de cliente
 * real, e para exercitar DRE, comparativo e relatorio com volume de verdade.
 *
 * Idempotente: apaga e recria a empresa de demonstracao a cada execucao. So
 * ela - a exclusao e por CNPJ fixo, e nunca toca em empresa cadastrada pelo
 * usuario.
 *
 * Os valores sao deterministicos: o mesmo comando produz sempre os mesmos
 * numeros, senao cada demonstracao contaria uma historia diferente.
 */

const DEMO_CNPJ = "11222333000181";
const DEMO_COMPANY = "Padaria São João (demonstração)";

/** Gerador previsivel: demonstracao nao pode mudar de numero a cada execucao. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

/** Data civil em UTC meia-noite, como o resto do produto (Secao 2). */
function civil(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Ultimo dia do mes, para nao gerar 31 de fevereiro. */
function lastDay(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

type Row = {
  date: Date;
  description: string;
  amountCents: number;
  category: string;
};

/**
 * Um mes de movimento de padaria.
 *
 * `growth` inclina o faturamento mes a mes para o comparativo da DRE ter o que
 * mostrar: tres meses identicos deixariam a coluna de variacao toda zerada.
 */
function buildMonth(params: {
  year: number;
  month: number;
  growth: number;
  seed: number;
  withEquipment: boolean;
  withProfitShare: boolean;
}): Row[] {
  const random = makeRandom(params.seed);
  const rows: Row[] = [];
  const end = lastDay(params.year, params.month);

  const push = (
    day: number,
    description: string,
    cents: number,
    category: string,
  ) => {
    rows.push({
      date: civil(params.year, params.month, Math.min(day, end)),
      description,
      amountCents: cents,
      category,
    });
  };

  const scale = (cents: number) => Math.round(cents * params.growth);

  // --- Receitas: PIX no balcao e recebiveis de cartao ---------------------
  let cardRevenue = 0;

  for (let day = 1; day <= end; day += 1) {
    // Domingo fechado.
    if (civil(params.year, params.month, day).getUTCDay() === 0) continue;

    const suffix = `${String(day).padStart(2, "0")}${String(params.month).padStart(2, "0")}`;
    push(
      day,
      `PIX RECEBIDO ${suffix}`,
      scale(120_000 + Math.round(random() * 200_000)),
      "Receita de vendas",
    );

    if (day % 3 === 0) {
      const card = scale(350_000 + Math.round(random() * 300_000));
      cardRevenue += card;
      push(day, "CIELO CREDITO D+30", card, "Receita de vendas");
    }
  }

  const revenue = rows.reduce((total, row) => total + row.amountCents, 0);

  // --- Custos variaveis ---------------------------------------------------
  for (const day of [4, 11, 18, 25]) {
    push(
      day,
      "PAG FORNECEDOR MOINHO CENTRAL",
      -scale(800_000 + Math.round(random() * 400_000)),
      "Fornecedores / CMV",
    );
  }
  push(
    end,
    "TAXA CIELO ANTECIPACAO",
    -Math.round(cardRevenue * 0.025),
    "Taxas de meios de pagamento",
  );

  // --- Pessoal ------------------------------------------------------------
  push(5, "FOLHA DE PAGAMENTO", -1_600_000, "Salários");
  push(5, "PRO LABORE SOCIO", -600_000, "Pró-labore");
  push(7, "GPS INSS COMPETENCIA", -350_000, "Encargos (INSS/FGTS)");
  push(7, "FGTS CONECTIVIDADE SOCIAL", -128_000, "Encargos (INSS/FGTS)");
  push(5, "VALE TRANSPORTE", -120_000, "Benefícios");

  // --- Operacionais -------------------------------------------------------
  push(10, "ALUGUEL LOJA - IMOBILIARIA CENTRO", -650_000, "Aluguel e condomínio");
  push(15, "ENEL DISTRIBUICAO", -320_000, "Energia, água e internet");
  push(15, "SABESP", -90_000, "Energia, água e internet");
  push(16, "VIVO FIBRA EMPRESAS", -40_000, "Energia, água e internet");
  push(3, "ASSINATURA SISTEMA PDV", -39_000, "Software e tecnologia");
  push(10, "HONORARIOS CONTABEIS", -120_000, "Serviços de terceiros");
  push(12, "IMPULSIONAMENTO REDES", -90_000, "Marketing e comercial");
  push(20, "MATERIAL DE LIMPEZA E EMBALAGEM", -180_000, "Despesas administrativas");

  // --- Impostos: DAS incide sobre o faturamento do mes --------------------
  push(
    20,
    "DAS SIMPLES NACIONAL",
    -Math.round(revenue * 0.06),
    "Simples Nacional / DAS",
  );

  // --- Financeiras --------------------------------------------------------
  push(end, "TARIFA MANUT CONTA PJ", -8_990, "Tarifas bancárias");
  push(end, "IOF", -1_240, "Tarifas bancárias");

  // --- Eventos que nao acontecem todo mes ---------------------------------
  if (params.withEquipment) {
    push(14, "FORNO TURBO INDUSTRIAL 10 ESTEIRAS", -750_000, "Equipamentos");
  }
  if (params.withProfitShare) {
    push(28, "DISTRIBUICAO DE LUCROS", -800_000, "Distribuição de lucros");
  }

  return rows.sort((a, b) => a.date.getTime() - b.date.getTime());
}

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DIRECT_URL ou DATABASE_URL precisa estar configurada.");
  }

  const slug = process.argv[2];
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    // --- Workspace de destino ---------------------------------------------
    const workspaces = await prisma.workspace.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { createdAt: "asc" },
    });

    if (workspaces.length === 0) {
      throw new Error(
        "Nenhum workspace encontrado. Crie a conta e conclua o onboarding antes de rodar a demonstração.",
      );
    }

    const workspace = slug
      ? workspaces.find((candidate) => candidate.slug === slug)
      : workspaces.length === 1
        ? workspaces[0]
        : undefined;

    if (!workspace) {
      const list = workspaces.map((w) => `  ${w.slug} — ${w.name}`).join("\n");
      throw new Error(
        slug
          ? `Workspace "${slug}" não encontrado. Disponíveis:\n${list}`
          : `Há mais de um workspace. Informe o slug:\n\n  npm run db:demo -- <slug>\n\n${list}`,
      );
    }

    // --- Categorias do workspace ------------------------------------------
    const categories = await prisma.category.findMany({
      where: { OR: [{ workspaceId: workspace.id }, { workspaceId: null }] },
      select: { id: true, name: true, workspaceId: true },
    });

    // A copia do workspace tem prioridade sobre a do sistema: o plano padrao e
    // clonado no onboarding, e e a copia do escritorio que as telas exibem.
    const byName = new Map<string, string>();
    for (const category of categories) {
      if (!byName.has(category.name)) byName.set(category.name, category.id);
    }
    for (const category of categories) {
      if (category.workspaceId === workspace.id) {
        byName.set(category.name, category.id);
      }
    }

    // --- Meses: os tres ultimos ja encerrados -----------------------------
    const today = new Date();
    const months: { year: number; month: number }[] = [];
    for (let back = 3; back >= 1; back -= 1) {
      const reference = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - back, 1),
      );
      months.push({
        year: reference.getUTCFullYear(),
        month: reference.getUTCMonth() + 1,
      });
    }

    const rows = months.flatMap((month, index) =>
      buildMonth({
        year: month.year,
        month: month.month,
        growth: [1, 1.09, 1.17][index],
        seed: month.year * 100 + month.month,
        withEquipment: index === 1,
        withProfitShare: index === 2,
      }),
    );

    const missing = [...new Set(rows.map((row) => row.category))].filter(
      (name) => !byName.has(name),
    );
    if (missing.length > 0) {
      throw new Error(
        `Categorias não encontradas no workspace (renomeadas?): ${missing.join(", ")}.\n` +
          "Rode `npm run db:seed` ou ajuste os nomes em scripts/demo.ts.",
      );
    }

    // --- Recria a empresa de demonstracao ---------------------------------
    const existing = await prisma.company.findFirst({
      where: { workspaceId: workspace.id, cnpj: DEMO_CNPJ },
    });

    if (existing) {
      await prisma.company.delete({ where: { id: existing.id } });
      console.log("Empresa de demonstração anterior removida.");
    }

    const first = months[0];
    const openingDate = civil(first.year, first.month, 1);
    openingDate.setUTCDate(openingDate.getUTCDate() - 1);

    const company = await prisma.company.create({
      data: {
        workspaceId: workspace.id,
        name: DEMO_COMPANY,
        cnpj: DEMO_CNPJ,
        segment: "Panificação e confeitaria",
        accounts: {
          create: {
            bankName: "Banco do Brasil",
            nickname: "Conta corrente",
            // Saldo da vespera do primeiro extrato: contar lancamentos
            // anteriores somaria o mesmo dinheiro duas vezes.
            openingBalanceCents: 4_500_000,
            openingBalanceDate: openingDate,
          },
        },
      },
      include: { accounts: true },
    });

    const account = company.accounts[0];

    await prisma.transaction.createMany({
      data: rows.map((row) => ({
        accountId: account.id,
        date: row.date,
        description: row.description,
        amountCents: row.amountCents,
        dedupeHash: dedupeHash({
          accountId: account.id,
          date: row.date,
          amountCents: row.amountCents,
          description: row.description,
        }),
        categoryId: byName.get(row.category)!,
        categorizedBy: "RULE" as const,
      })),
      skipDuplicates: true,
    });

    const inserted = await prisma.transaction.count({
      where: { accountId: account.id },
    });

    const label = months
      .map((m) => `${String(m.month).padStart(2, "0")}/${m.year}`)
      .join(", ");

    console.log(
      [
        "",
        `Empresa de demonstração criada em "${workspace.name}".`,
        `  Empresa:      ${DEMO_COMPANY}`,
        `  Competências: ${label}`,
        `  Lançamentos:  ${inserted} (todos categorizados)`,
        "",
        "Abra o painel, escolha a empresa e feche um dos meses para ver o relatório.",
        "",
      ].join("\n"),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
