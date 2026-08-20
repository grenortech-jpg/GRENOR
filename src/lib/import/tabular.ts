import { looksLikeDate, parseExcelSerial, parseFlexibleDate } from "@/lib/import/dates";
import { parseMoneyToCents } from "@/lib/format";
import type {
  ColumnMapping,
  ParseWarning,
  ParsedTransaction,
} from "@/lib/import/types";

/**
 * Logica comum a CSV e XLSX: descobrir quais colunas sao data, descricao e
 * valor, e transformar linhas cruas em transacoes.
 *
 * A heuristica central da Secao 5.1: linha sem data valida nao e transacao.
 * E o que descarta cabecalho, linhas de "SALDO ANTERIOR" e rodape de totais
 * sem precisar conhecer o layout de cada banco.
 */

const DATE_HEADERS = ["data", "date", "dt", "data lancamento", "data movimento"];
const DESCRIPTION_HEADERS = [
  "historico",
  "descricao",
  "description",
  "lancamento",
  "memo",
  "detalhe",
  "historico complementar",
];
const AMOUNT_HEADERS = ["valor", "amount", "montante", "vlr", "valor (r$)"];
const CREDIT_HEADERS = ["credito", "entrada", "receita", "credit"];
const DEBIT_HEADERS = ["debito", "saida", "despesa", "debit"];

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matches(header: string, candidates: string[]): boolean {
  const normalized = normalizeHeader(header);
  return candidates.some(
    (candidate) => normalized === candidate || normalized.startsWith(candidate),
  );
}

/** Linha que parece cabecalho: tem texto e nenhuma data valida. */
export function isHeaderRow(row: string[]): boolean {
  const filled = row.filter((cell) => cell.trim());
  if (filled.length < 2) return false;
  return !filled.some((cell) => looksLikeDate(cell));
}

/**
 * Descobre o mapeamento. Tenta pelos nomes de coluna; se o arquivo nao tiver
 * cabecalho reconhecivel, deduz pelo conteudo das linhas de dados.
 */
export function detectMapping(
  headers: string[] | null,
  rows: string[][],
): ColumnMapping | null {
  if (headers) {
    const find = (candidates: string[]) =>
      headers.findIndex((header) => matches(header, candidates));

    const date = find(DATE_HEADERS);
    const description = find(DESCRIPTION_HEADERS);
    const amount = find(AMOUNT_HEADERS);
    const credit = find(CREDIT_HEADERS);
    const debit = find(DEBIT_HEADERS);

    if (date >= 0 && description >= 0 && (amount >= 0 || credit >= 0 || debit >= 0)) {
      return {
        date,
        description,
        ...(amount >= 0 ? { amount } : {}),
        ...(credit >= 0 ? { credit } : {}),
        ...(debit >= 0 ? { debit } : {}),
      };
    }
  }

  return detectMappingFromData(rows);
}

/** Sem cabecalho util: a primeira coluna com datas e a data, e assim por diante. */
function detectMappingFromData(rows: string[][]): ColumnMapping | null {
  const dataRows = rows.filter((row) => row.some((cell) => looksLikeDate(cell)));
  if (dataRows.length === 0) return null;

  const columns = Math.max(...dataRows.map((row) => row.length));
  const score = (predicate: (cell: string) => boolean) => {
    const counts = new Array(columns).fill(0);
    for (const row of dataRows) {
      for (let index = 0; index < columns; index += 1) {
        if (predicate(row[index] ?? "")) counts[index] += 1;
      }
    }
    return counts;
  };

  const dateCounts = score((cell) => looksLikeDate(cell));
  const moneyCounts = score(
    (cell) => cell.trim() !== "" && parseMoneyToCents(cell) !== null,
  );
  const textCounts = score(
    (cell) => cell.trim().length > 3 && parseMoneyToCents(cell) === null,
  );

  const best = (counts: number[], exclude: number[] = []) => {
    let bestIndex = -1;
    let bestValue = 0;
    counts.forEach((value, index) => {
      if (exclude.includes(index)) return;
      if (value > bestValue) {
        bestValue = value;
        bestIndex = index;
      }
    });
    return bestValue > 0 ? bestIndex : -1;
  };

  const date = best(dateCounts);
  if (date === -1) return null;

  const description = best(textCounts, [date]);
  const amount = best(moneyCounts, [date, description]);

  if (description === -1 || amount === -1) return null;

  return { date, description, amount };
}

/** Converte linhas cruas em transacoes, descartando o que nao e lancamento. */
export function rowsToTransactions(
  rows: string[][],
  mapping: ColumnMapping,
  options: { firstLine?: number } = {},
): { transactions: ParsedTransaction[]; warnings: ParseWarning[] } {
  const transactions: ParsedTransaction[] = [];
  const warnings: ParseWarning[] = [];
  const firstLine = options.firstLine ?? 1;

  rows.forEach((row, index) => {
    const line = firstLine + index;
    const rawDate = (row[mapping.date] ?? "").trim();

    // Heuristica da Secao 5.1: sem data valida, nao e transacao. Cabecalho,
    // "SALDO ANTERIOR" e rodape de totais caem aqui em silencio.
    if (!rawDate) return;

    const date = parseFlexibleDate(rawDate) ?? parseSerialCell(rawDate);
    if (!date) return;

    const description = (row[mapping.description] ?? "").trim();
    const amountCents = readAmount(row, mapping);

    if (amountCents === null) {
      warnings.push({
        line,
        reason: `Valor não reconhecido${description ? ` em "${description}"` : ""}.`,
      });
      return;
    }

    // Valor zero costuma ser linha de saldo, nao movimento.
    if (amountCents === 0) {
      warnings.push({
        line,
        reason: `Linha com valor zero ignorada${description ? `: "${description}"` : ""}.`,
      });
      return;
    }

    transactions.push({
      date,
      description: description || "Sem descrição",
      amountCents,
      sourceLine: line,
    });
  });

  return { transactions, warnings };
}

function parseSerialCell(value: string): Date | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return parseExcelSerial(numeric);
}

/**
 * Le o valor, seja de uma coluna com sinal ou de colunas separadas de
 * credito e debito. Debito entra como saida mesmo quando o banco escreve
 * o numero sem sinal.
 */
function readAmount(row: string[], mapping: ColumnMapping): number | null {
  if (mapping.amount !== undefined) {
    const raw = (row[mapping.amount] ?? "").trim();
    if (!raw) return null;
    return parseMoneyToCents(raw);
  }

  const credit =
    mapping.credit !== undefined
      ? parseMoneyToCents((row[mapping.credit] ?? "").trim() || "0")
      : null;
  const debit =
    mapping.debit !== undefined
      ? parseMoneyToCents((row[mapping.debit] ?? "").trim() || "0")
      : null;

  if (credit === null && debit === null) return null;

  const inflow = credit ?? 0;
  const outflow = debit ?? 0;

  if (inflow === 0 && outflow === 0) return 0;
  if (inflow !== 0) return Math.abs(inflow);
  return -Math.abs(outflow);
}
