import { describe, expect, it } from "vitest";

import {
  currentMonth,
  lastMonths,
  monthEnd,
  monthKey,
  monthStart,
  nextMonth,
  parseMonthKey,
  previousMonth,
} from "@/lib/period";
import { isReservedSlug, slugify, uniqueSlug } from "@/lib/workspace/slug";

describe("mes de competencia", () => {
  it("usa o fuso de Sao Paulo, nao o do servidor", () => {
    // 1o de setembro 02:00 UTC ainda e 31 de agosto em Sao Paulo (UTC-3).
    const month = currentMonth(new Date("2026-09-01T02:00:00Z"));
    expect(month).toEqual({ year: 2026, month: 8 });
  });

  it("vira o mes no horario certo", () => {
    const month = currentMonth(new Date("2026-09-01T03:00:00Z"));
    expect(month).toEqual({ year: 2026, month: 9 });
  });

  it("delimita o intervalo do mes", () => {
    const month = { year: 2026, month: 2 };
    expect(monthStart(month).toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(monthEnd(month).toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("atravessa a virada do ano", () => {
    expect(previousMonth({ year: 2026, month: 1 })).toEqual({
      year: 2025,
      month: 12,
    });
    expect(nextMonth({ year: 2026, month: 12 })).toEqual({
      year: 2027,
      month: 1,
    });
  });

  it("lista os ultimos meses em ordem cronologica", () => {
    const months = lastMonths({ year: 2026, month: 2 }, 6);

    expect(months).toHaveLength(6);
    expect(months[0]).toEqual({ year: 2025, month: 9 });
    expect(months[5]).toEqual({ year: 2026, month: 2 });
  });

  it("converte de e para chave de URL", () => {
    expect(monthKey({ year: 2026, month: 3 })).toBe("2026-03");
    expect(parseMonthKey("2026-03")).toEqual({ year: 2026, month: 3 });
    expect(parseMonthKey("2026-13")).toBeNull();
    expect(parseMonthKey("marco")).toBeNull();
  });
});

describe("slug do workspace", () => {
  it("remove acentos e pontuacao", () => {
    expect(slugify("Contabilidade Água & Cia")).toBe("contabilidade-agua-cia");
    expect(slugify("  Silva   Contábil  ")).toBe("silva-contabil");
    expect(slugify("BPO Financeiro 2026")).toBe("bpo-financeiro-2026");
  });

  it("nunca devolve vazio", () => {
    expect(slugify("###")).toBe("workspace");
    expect(slugify("")).toBe("workspace");
  });

  it("resolve colisao com sufixo", () => {
    const taken = new Set(["silva-contabil"]);
    expect(uniqueSlug("Silva Contábil", taken)).toBe("silva-contabil-2");

    taken.add("silva-contabil-2");
    expect(uniqueSlug("Silva Contábil", taken)).toBe("silva-contabil-3");
  });

  // Um workspace chamado "App" nao pode sequestrar a rota /app.
  it("nao entrega slug reservado", () => {
    expect(isReservedSlug("app")).toBe(true);
    expect(uniqueSlug("App", new Set())).toBe("app-2");
    expect(uniqueSlug("Configurações", new Set())).toBe("configuracoes-2");
  });
});
