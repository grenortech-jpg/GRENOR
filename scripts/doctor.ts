import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Diagnostico da instalacao: diz exatamente o que falta configurar antes de a
 * aplicacao funcionar. Rode com `npm run doctor`.
 */

const CHECK = "✓";
const CROSS = "✗";

let failures = 0;

function ok(label: string, detail?: string) {
  console.log(`  ${CHECK} ${label}${detail ? ` — ${detail}` : ""}`);
}

function fail(label: string, hint: string) {
  failures += 1;
  console.log(`  ${CROSS} ${label}`);
  console.log(`      ${hint}`);
}

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  return (
    value.includes("SEU-PROJETO") ||
    value.includes("SENHA") ||
    value.startsWith("sua-")
  );
}

function checkEnv(): boolean {
  console.log("\nVariaveis de ambiente");

  const required = [
    ["NEXT_PUBLIC_SUPABASE_URL", "Project Settings > Data API > Project URL"],
    [
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "Project Settings > API Keys > Publishable key (sb_publishable_...)",
    ],
    [
      "SUPABASE_SERVICE_ROLE_KEY",
      "Project Settings > API Keys > Secret key (sb_secret_...)",
    ],
    ["DATABASE_URL", "Database > Connection string > Transaction pooler (6543)"],
    ["DIRECT_URL", "Database > Connection string > conexao direta (5432)"],
  ] as const;

  let complete = true;

  for (const [name, where] of required) {
    const value = process.env[name];
    if (isPlaceholder(value)) {
      complete = false;
      fail(`${name} nao configurada`, `Copie de: ${where}`);
    } else {
      ok(name);
    }
  }

  if (!process.env.NEXT_PUBLIC_SITE_URL) {
    console.log(
      "  ! NEXT_PUBLIC_SITE_URL ausente — assumindo http://localhost:3000",
    );
  } else {
    ok("NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL);
  }

  return complete;
}

async function checkSupabase() {
  console.log("\nSupabase Auth");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: anonKey },
      signal: AbortSignal.timeout(10_000),
    });

    if (response.ok) {
      const settings = (await response.json()) as {
        external?: Record<string, boolean>;
        mailer_autoconfirm?: boolean;
      };
      ok("Endpoint de auth respondendo");
      ok(
        "Provider Google",
        settings.external?.google ? "habilitado" : "desabilitado",
      );
      ok(
        "Confirmacao de e-mail",
        settings.mailer_autoconfirm ? "desligada (autoconfirm)" : "exigida",
      );
    } else if (response.status === 401) {
      fail(
        "Chave anon rejeitada",
        "Confira NEXT_PUBLIC_SUPABASE_ANON_KEY em Project Settings > API.",
      );
    } else {
      fail(
        `Auth respondeu ${response.status}`,
        "Confira NEXT_PUBLIC_SUPABASE_URL.",
      );
    }
  } catch (error) {
    fail(
      "Nao foi possivel alcancar o Supabase",
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function checkDatabase() {
  console.log("\nBanco de dados");

  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    await prisma.$queryRaw`SELECT 1`;
    ok("Conexao estabelecida");

    const categories = await prisma.category.count({
      where: { workspaceId: null },
    });

    if (categories === 0) {
      fail(
        "Plano de contas padrao vazio",
        "Rode: npm run db:seed",
      );
    } else {
      ok("Plano de contas padrao", `${categories} categorias`);
    }

    const policies = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count
      FROM pg_policies
      WHERE schemaname = 'public'
    `;
    const policyCount = Number(policies[0]?.count ?? 0);

    if (policyCount === 0) {
      fail(
        "Nenhuma policy de RLS encontrada",
        "A migracao de RLS nao foi aplicada. Rode: npm run db:deploy",
      );
    } else {
      ok("Row Level Security", `${policyCount} policies ativas`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("does not exist") || message.includes("P2021")) {
      fail("Tabelas ausentes", "Rode: npm run db:deploy");
    } else {
      fail("Falha ao consultar o banco", message);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  console.log("Grenor — diagnostico da instalacao");

  const envComplete = checkEnv();

  if (!envComplete) {
    console.log(
      "\nPreencha o .env (passo a passo no README) e rode de novo.\n",
    );
    process.exit(1);
  }

  await checkSupabase();
  await checkDatabase();

  if (failures > 0) {
    console.log(`\n${failures} item(ns) pendente(s).\n`);
    process.exit(1);
  }

  console.log("\nTudo pronto.\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
