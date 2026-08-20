/**
 * Mes de competencia. O produto trabalha por mes civil no fuso
 * America/Sao_Paulo (Secao 2), independente de onde o servidor roda.
 */

export type YearMonth = { year: number; month: number };

const SAO_PAULO = "America/Sao_Paulo";

/** Mes corrente em Sao Paulo, nao em UTC nem no fuso do servidor. */
export function currentMonth(now: Date = new Date()): YearMonth {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SAO_PAULO,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);

  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);

  return { year: get("year"), month: get("month") };
}

/** Primeiro instante do mes, como data civil em UTC. */
export function monthStart({ year, month }: YearMonth): Date {
  return new Date(Date.UTC(year, month - 1, 1));
}

/** Primeiro instante do mes seguinte: use com `lt` para fechar o intervalo. */
export function monthEnd({ year, month }: YearMonth): Date {
  return new Date(Date.UTC(year, month, 1));
}

export function previousMonth({ year, month }: YearMonth): YearMonth {
  return month === 1
    ? { year: year - 1, month: 12 }
    : { year, month: month - 1 };
}

export function nextMonth({ year, month }: YearMonth): YearMonth {
  return month === 12
    ? { year: year + 1, month: 1 }
    : { year, month: month + 1 };
}

/** Os `count` meses terminando em `end`, do mais antigo para o mais recente. */
export function lastMonths(end: YearMonth, count: number): YearMonth[] {
  const months: YearMonth[] = [];
  let cursor = end;

  for (let index = 0; index < count; index += 1) {
    months.unshift(cursor);
    cursor = previousMonth(cursor);
  }

  return months;
}

/** "2026-08", para chaves e parametros de URL. */
export function monthKey({ year, month }: YearMonth): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** "2026-08" -> {year, month}. Invalido devolve null. */
export function parseMonthKey(value: string): YearMonth | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (month < 1 || month > 12) return null;
  if (year < 2000 || year > 2100) return null;

  return { year, month };
}
