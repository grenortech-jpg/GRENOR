import { describe, expect, it } from "vitest";

import { firstIssue, parseWaitlist } from "@/lib/validation/schemas";

/**
 * Formulario publico: e a unica entrada do produto que qualquer um na internet
 * alcanca sem autenticacao. A validacao aqui e a primeira barreira.
 */

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
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

  it("recusa e-mail absurdamente longo", () => {
    const parsed = parseWaitlist(form({ email: `${"a".repeat(200)}@x.com` }));

    expect(parsed.success).toBe(false);
  });
});
