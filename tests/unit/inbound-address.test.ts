import { describe, expect, it } from "vitest";

import {
  buildInboundAddress,
  extractEmail,
  isAllowedSender,
  parseInboundAddress,
  slugify,
} from "@/lib/inbound/address";

/** Endereco dedicado de ingestao por e-mail (Fase 12). */

const TOKEN = "0123456789abcdef0123";

describe("endereco de ingestao", () => {
  it("le token e tag da conta", () => {
    expect(parseInboundAddress(`${TOKEN}@extratos.finort.com.br`)).toEqual({ token: TOKEN, accountTag: null });
    expect(parseInboundAddress(`${TOKEN}+Conta-Corrente@extratos.finort.com.br`)).toEqual({ token: TOKEN, accountTag: "conta-corrente" });
    expect(parseInboundAddress(`Finort <${TOKEN}@extratos.finort.com.br>`)).toEqual({ token: TOKEN, accountTag: null });
  });

  it("recusa token fora do formato", () => {
    expect(parseInboundAddress("contato@extratos.finort.com.br")).toBeNull();
    expect(parseInboundAddress(`${TOKEN}X@extratos.finort.com.br`)).toBeNull();
    expect(parseInboundAddress("")).toBeNull();
  });

  it("slug do apelido da conta", () => {
    expect(slugify("Conta Corrente Itaú")).toBe("conta-corrente-itau");
    expect(slugify("  Poupança ")).toBe("poupanca");
  });

  it("extrai o e-mail de um remetente com nome", () => {
    expect(extractEmail("Maria Silva <Maria@Banco.com.br>")).toBe("maria@banco.com.br");
    expect(extractEmail("sem-email")).toBeNull();
  });

  it("lista de remetentes e exata, sem diferenciar maiusculas", () => {
    const allow = ["extrato@banco.com.br"];
    expect(isAllowedSender("Banco <EXTRATO@banco.com.br>", allow)).toBe(true);
    expect(isAllowedSender("outro@banco.com.br", allow)).toBe(false);
    expect(isAllowedSender("extrato@banco.com.br.evil.com", allow)).toBe(false);
    expect(isAllowedSender("extrato@banco.com.br", [])).toBe(false);
  });

  it("endereco completo depende do dominio", () => {
    expect(buildInboundAddress(TOKEN, "extratos.finort.com.br")).toBe(`${TOKEN}@extratos.finort.com.br`);
    expect(buildInboundAddress(TOKEN, undefined)).toBeNull();
  });
});
