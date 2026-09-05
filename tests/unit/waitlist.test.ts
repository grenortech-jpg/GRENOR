import { describe, expect, it } from "vitest";

import { firstIssue, parseWaitlist } from "@/lib/validation/schemas";

/**
 * Formulario publico: e a unica entrada do produto que qualquer um na internet
 * alcanca sem autenticacao. A validacao aqui e a primeira barreira.
 */

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

describe("lista de espera", () => {
  it("aceita so o e-mail: nome e escritorio sao opcionais", () => {
    const parsed = parseWaitlist(form({ email: "joana@escritorio.com.br" }));

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBeUndefined();
      expect(parsed.data.office).toBeUndefined();
    }
  });

  it("aceita o cadastro completo", () => {
    const parsed = parseWaitlist(
      form({
        email: "joana@escritorio.com.br",
        name: "Joana Ribeiro",
        office: "Contabilidade Ribeiro",
      }),
    );

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.office).toBe("Contabilidade Ribeiro");
    }
  });

  it("cobra o e-mail", () => {
    const parsed = parseWaitlist(form({}));

    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(firstIssue(parsed.error)).toBe("Informe o e-mail.");
  });

  it("recusa e-mail malformado", () => {
    const parsed = parseWaitlist(form({ email: "joana@" }));

    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(firstIssue(parsed.error)).toBe("E-mail inválido.");
  });

  it("apara espacos ao redor do e-mail", () => {
    const parsed = parseWaitlist(form({ email: "  joana@escritorio.com.br  " }));

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe("joana@escritorio.com.br");
  });

  it("campo opcional vazio vira undefined, nao string vazia", () => {
    // Gravar "" no banco faria a coluna parecer preenchida.
    const parsed = parseWaitlist(
      form({ email: "joana@escritorio.com.br", name: "   ", office: "" }),
    );

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBeUndefined();
      expect(parsed.data.office).toBeUndefined();
    }
  });

  it("cobra o consentimento (Fase 10)", () => {
    const parsed = parseWaitlist(
      form({ email: "joana@escritorio.com.br" }, { consent: false }),
    );

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(firstIssue(parsed.error)).toMatch(/aviso de privacidade/i);
    }
  });

  it("so aceita a caixa marcada de verdade, nao qualquer valor", () => {
    // Robo que envia consent=1 nao consentiu com nada.
    const parsed = parseWaitlist(
      form({ email: "joana@escritorio.com.br", consent: "1" }, { consent: false }),
    );

    expect(parsed.success).toBe(false);
  });

  it("recusa e-mail absurdamente longo", () => {
    const parsed = parseWaitlist(form({ email: `${"a".repeat(200)}@x.com` }));

    expect(parsed.success).toBe(false);
  });
});
