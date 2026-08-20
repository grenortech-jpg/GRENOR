import { describe, expect, it } from "vitest";

import {
  firstIssue,
  parseNewPassword,
  parseResetRequest,
  parseSignIn,
  parseSignUp,
  safeRedirect,
} from "@/lib/auth/forms";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

describe("login", () => {
  // Regressao: FormData.get devolve null para campo ausente, e null nao
  // satisfaz z.string().optional(). Isso derrubava a validacao inteira e
  // tornava o login impossivel sempre que nao havia ?redirect= na URL.
  it("aceita formulario sem o campo redirect", () => {
    const parsed = parseSignIn(
      form({ email: "pessoa@escritorio.com.br", password: "senha-secreta" }),
    );

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.redirect).toBeUndefined();
  });

  it("preserva o redirect quando presente", () => {
    const parsed = parseSignIn(
      form({
        email: "pessoa@escritorio.com.br",
        password: "senha-secreta",
        redirect: "/app",
      }),
    );

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.redirect).toBe("/app");
  });

  it("cobra o e-mail com mensagem propria", () => {
    const parsed = parseSignIn(form({ password: "senha-secreta" }));

    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(firstIssue(parsed.error)).toBe("Informe o e-mail.");
  });

  it("cobra a senha com mensagem propria", () => {
    const parsed = parseSignIn(form({ email: "pessoa@escritorio.com.br" }));

    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(firstIssue(parsed.error)).toBe("Informe a senha.");
  });

  it("rejeita e-mail invalido", () => {
    const parsed = parseSignIn(form({ email: "nao-e-email", password: "x" }));

    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(firstIssue(parsed.error)).toBe("E-mail inválido.");
  });
});

describe("cadastro", () => {
  it("aceita dados completos", () => {
    const parsed = parseSignUp(
      form({
        name: "Maria Silva",
        email: "maria@escritorio.com.br",
        password: "senha-de-oito",
      }),
    );

    expect(parsed.success).toBe(true);
  });

  it("exige oito caracteres na senha", () => {
    const parsed = parseSignUp(
      form({ name: "Maria", email: "maria@escritorio.com.br", password: "curta" }),
    );

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(firstIssue(parsed.error)).toBe(
        "A senha precisa ter ao menos 8 caracteres.",
      );
    }
  });

  it("exige nome", () => {
    const parsed = parseSignUp(
      form({ email: "maria@escritorio.com.br", password: "senha-de-oito" }),
    );

    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(firstIssue(parsed.error)).toBe("Informe seu nome.");
  });
});

describe("recuperacao de senha", () => {
  it("aceita e-mail valido", () => {
    expect(parseResetRequest(form({ email: "a@b.com.br" })).success).toBe(true);
  });

  it("recusa formulario vazio", () => {
    expect(parseResetRequest(form({})).success).toBe(false);
  });
});

describe("nova senha", () => {
  it("aceita senhas iguais", () => {
    const parsed = parseNewPassword(
      form({ password: "senha-de-oito", passwordConfirmation: "senha-de-oito" }),
    );

    expect(parsed.success).toBe(true);
  });

  it("recusa senhas diferentes", () => {
    const parsed = parseNewPassword(
      form({ password: "senha-de-oito", passwordConfirmation: "outra-senha" }),
    );

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(firstIssue(parsed.error)).toBe("As senhas não conferem.");
    }
  });
});

describe("safeRedirect", () => {
  it("usa o fallback quando nao ha destino", () => {
    expect(safeRedirect(undefined, "/app")).toBe("/app");
  });

  it("aceita caminho interno", () => {
    expect(safeRedirect("/empresas/123", "/app")).toBe("/empresas/123");
  });

  it("recusa destino externo", () => {
    expect(safeRedirect("https://exemplo.com", "/app")).toBe("/app");
  });

  // "//host" e "/\host" viram URL absoluta no navegador: open redirect.
  it("recusa barra dupla e barra invertida", () => {
    expect(safeRedirect("//exemplo.com", "/app")).toBe("/app");
    expect(safeRedirect("/\\exemplo.com", "/app")).toBe("/app");
  });
});
