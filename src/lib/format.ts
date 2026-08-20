/**
 * Formatacao para a interface. Tudo em pt-BR e BRL (Secao 2).
 *
 * Dinheiro trafega sempre em centavos inteiros; a conversao para reais
 * acontece so na hora de exibir.
 */

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const BRL_NO_SYMBOL = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Centavos -> "R$ 1.234,56". */
export function formatMoney(cents: number): string {
  return BRL.format(cents / 100);
}

/** Centavos -> "1.234,56" (sem simbolo, para tabelas). */
export function formatAmount(cents: number): string {
  return BRL_NO_SYMBOL.format(cents / 100);
}

/**
 * "1.234,56", "1234.56", "R$ 1.234,56", "(1.234,56)", "1.234,56-" -> centavos.
 * Retorna null quando nao ha numero reconhecivel.
 *
 * Aceita tanto virgula quanto ponto como separador decimal: o ultimo
 * separador presente vence, que e a regra que funciona para os dois padroes.
 */
export function parseMoneyToCents(input: string): number | null {
  if (typeof input !== "string") return null;

  let text = input.trim();
  if (!text) return null;

  // Parenteses e sinal a direita indicam negativo em extratos brasileiros.
  let negative = false;
  if (text.startsWith("(") && text.endsWith(")")) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.endsWith("-")) {
    negative = true;
    text = text.slice(0, -1);
  }
  if (text.startsWith("-")) {
    negative = true;
    text = text.slice(1);
  }

  text = text.replace(/R\$/gi, "").replace(/\s/g, "").trim();
  if (!text) return null;
  if (!/[0-9]/.test(text)) return null;
  if (/[^0-9.,]/.test(text)) return null;

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  const separator = Math.max(lastComma, lastDot);

  let integerPart: string;
  let decimalPart: string;

  if (separator === -1) {
    integerPart = text;
    decimalPart = "";
  } else {
    const decimals = text.slice(separator + 1);
    // Mais de dois digitos depois do separador: e agrupador de milhar,
    // nao decimal (ex.: "1.234").
    if (decimals.length > 2 || decimals.length === 0) {
      integerPart = text;
      decimalPart = "";
    } else {
      integerPart = text.slice(0, separator);
      decimalPart = decimals;
    }
  }

  integerPart = integerPart.replace(/[.,]/g, "");
  if (!integerPart) integerPart = "0";
  if (!/^\d+$/.test(integerPart)) return null;

  const cents =
    Number(integerPart) * 100 + Number(decimalPart.padEnd(2, "0") || "0");

  if (!Number.isFinite(cents)) return null;
  return negative ? -cents : cents;
}

const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Datas civis sao gravadas como @db.Date e chegam em UTC meia-noite.
 * Formatar em UTC evita o classico "um dia a menos" no fuso de Sao Paulo.
 */
export function formatDate(date: Date): string {
  return DATE_FORMATTER.format(date);
}

/** "2026-08-20" -> Date em UTC meia-noite, sem deslocamento de fuso. */
export function parseCivilDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const [, year, month, day] = match;
  const date = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)),
  );

  // Rejeita 31/02 e afins, que o Date normalizaria silenciosamente.
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  return date;
}

/** Date -> "2026-08-20", para preencher <input type="date">. */
export function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** (2026, 8) -> "agosto de 2026". */
export function formatMonth(year: number, month: number): string {
  return `${MONTHS[month - 1]} de ${year}`;
}

/** Deixa so os digitos do CNPJ. */
export function normalizeCnpj(value: string): string {
  return value.replace(/\D/g, "");
}

/** 14 digitos -> "12.345.678/0001-95". Entrada invalida volta como veio. */
export function formatCnpj(value: string): string {
  const digits = normalizeCnpj(value);
  if (digits.length !== 14) return value;

  return digits.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    "$1.$2.$3/$4-$5",
  );
}

/** Validacao dos digitos verificadores do CNPJ. */
export function isValidCnpj(value: string): boolean {
  const digits = normalizeCnpj(value);
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const checkDigit = (length: number): number => {
    let weight = length - 7;
    let sum = 0;

    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * weight;
      weight -= 1;
      if (weight < 2) weight = 9;
    }

    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return (
    checkDigit(12) === Number(digits[12]) &&
    checkDigit(13) === Number(digits[13])
  );
}
