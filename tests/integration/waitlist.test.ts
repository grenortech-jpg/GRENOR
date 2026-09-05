import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { joinWaitlistAction } from "@/app/actions";
import { prisma } from "@/lib/prisma";

/**
 * Lista de espera da pagina publica (Fase 8).
 *
 * E a unica escrita do produto que qualquer um na internet alcanca sem
 * autenticacao, entao o comportamento aqui e testado no caminho real - a
 * propria Server Action, com FormData - e nao apenas no schema.
 *
 * Roda contra o banco real: `npm run test:db`.
 */

const SUFFIX = process.env.TEST_RUN_ID ?? "waitlist";
const DOMAIN = `${SUFFIX}.exemplo.test`;

/** FormData com a caixa de consentimento marcada, salvo pedido em contrario. */
function form(
  fields: Record<string, string>,
  options: { consent?: boolean } = {},
): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  if (options.consent !== false) data.append("consent", "on");
  return data;
}

async function cleanup() {
  await prisma.waitlistEntry.deleteMany({
    where: { email: { endsWith: `@${DOMAIN}` } },
  });
}

beforeAll(cleanup, 60_000);

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
}, 60_000);

describe("inscricao", () => {
  it("grava o e-mail e confirma", async () => {
    const state = await joinWaitlistAction(
      {},
      form({ email: `nova@${DOMAIN}`, name: "Joana", office: "Contabilidade J" }),
    );

    expect(state.error).toBeUndefined();
    expect(state.success).toBeTruthy();

    const entry = await prisma.waitlistEntry.findUnique({
      where: { email: `nova@${DOMAIN}` },
    });

    expect(entry?.name).toBe("Joana");
    expect(entry?.office).toBe("Contabilidade J");
    expect(entry?.consentAt).toBeInstanceOf(Date);
  });

  it("recusa inscricao sem o consentimento marcado, sem gravar nada", async () => {
    const state = await joinWaitlistAction(
      {},
      form({ email: `sem-consentimento@${DOMAIN}` }, { consent: false }),
    );

    expect(state.error).toMatch(/aviso de privacidade/i);

    const entry = await prisma.waitlistEntry.findUnique({
      where: { email: `sem-consentimento@${DOMAIN}` },
    });

    expect(entry).toBeNull();
  });

  it("aceita so o e-mail", async () => {
    const state = await joinWaitlistAction({}, form({ email: `so-email@${DOMAIN}` }));

    expect(state.success).toBeTruthy();

    const entry = await prisma.waitlistEntry.findUnique({
      where: { email: `so-email@${DOMAIN}` },
    });

    expect(entry).not.toBeNull();
    expect(entry?.name).toBeNull();
  });

  it("normaliza o e-mail para minusculas", async () => {
    await joinWaitlistAction({}, form({ email: `MAIUSCULA@${DOMAIN}` }));

    const entry = await prisma.waitlistEntry.findUnique({
      where: { email: `maiuscula@${DOMAIN}` },
    });

    expect(entry).not.toBeNull();
  });

  it("recusa e-mail invalido sem gravar nada", async () => {
    const antes = await prisma.waitlistEntry.count({
      where: { email: { endsWith: `@${DOMAIN}` } },
    });

    const state = await joinWaitlistAction({}, form({ email: "nao-e-email" }));

    expect(state.error).toBe("E-mail inválido.");

    const depois = await prisma.waitlistEntry.count({
      where: { email: { endsWith: `@${DOMAIN}` } },
    });

    expect(depois).toBe(antes);
  });
});

describe("reinscricao do mesmo e-mail", () => {
  const email = `repetido@${DOMAIN}`;

  it("nao duplica", async () => {
    await joinWaitlistAction({}, form({ email, name: "Primeira" }));
    await joinWaitlistAction({}, form({ email, name: "Segunda" }));

    const total = await prisma.waitlistEntry.count({ where: { email } });

    expect(total).toBe(1);
  });

  it("responde sucesso, nao erro", async () => {
    // Mensagem diferente para e-mail ja cadastrado transformaria o formulario
    // publico num oraculo de "esse endereco esta na lista?".
    const state = await joinWaitlistAction({}, form({ email }));

    expect(state.error).toBeUndefined();
    expect(state.success).toBeTruthy();
  });

  it("atualiza o que veio preenchido", async () => {
    await joinWaitlistAction({}, form({ email, office: "Escritório Novo" }));

    const entry = await prisma.waitlistEntry.findUnique({ where: { email } });

    expect(entry?.office).toBe("Escritório Novo");
  });

  it("nao apaga o que ja havia quando o campo vem vazio", async () => {
    await joinWaitlistAction({}, form({ email, name: "Definitiva" }));
    await joinWaitlistAction({}, form({ email }));

    const entry = await prisma.waitlistEntry.findUnique({ where: { email } });

    expect(entry?.name).toBe("Definitiva");
    expect(entry?.office).toBe("Escritório Novo");
  });
});

describe("armadilha para robo", () => {
  const email = `robo@${DOMAIN}`;

  it("nao grava quando o campo invisivel vem preenchido", async () => {
    await joinWaitlistAction({}, form({ email, website: "http://spam.example" }));

    const entry = await prisma.waitlistEntry.findUnique({ where: { email } });

    expect(entry).toBeNull();
  });

  it("responde o mesmo sucesso de sempre", async () => {
    // Dizer "voce e um robo" so ensina o robo a passar da proxima vez.
    const humano = await joinWaitlistAction({}, form({ email: `humano@${DOMAIN}` }));
    const robo = await joinWaitlistAction(
      {},
      form({ email: `outro-robo@${DOMAIN}`, website: "spam" }),
    );

    expect(robo.success).toBe(humano.success);
  });
});
