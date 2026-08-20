import Papa from "papaparse";

import {
  detectMapping,
  isHeaderRow,
  rowsToTransactions,
} from "@/lib/import/tabular";
import {
  ParseError,
  type ColumnMapping,
  type ParseResult,
} from "@/lib/import/types";

/**
 * CSV de banco brasileiro. O separador pode ser `;` ou `,` (Secao 5.1), e o
 * arquivo costuma vir com linhas de cabecalho do banco antes da tabela e um
 * rodape com saldo depois dela.
 */

const CANDIDATE_SEPARATORS = [";", ",", "\t", "|"];

/**
 * Escolhe o separador pela consistencia das linhas, nao pela contagem bruta:
 * descricoes com virgula ("PAGTO FORNECEDOR, LTDA") enganam a contagem, mas
 * nao produzem colunas consistentes.
 */
export function detectSeparator(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .slice(0, 40);

  if (lines.length === 0) return ";";

  let best = ";";
  let bestScore = -1;

  for (const separator of CANDIDATE_SEPARATORS) {
    const counts = lines.map(
      (line) => splitRespectingQuotes(line, separator).length,
    );
    const maxColumns = Math.max(...counts);
    if (maxColumns < 2) continue;

    // Quantas linhas concordam com a largura mais comum.
    const frequency = new Map<number, number>();
    for (const count of counts) {
      frequency.set(count, (frequency.get(count) ?? 0) + 1);
    }

    let dominant = 0;
    let dominantColumns = 0;
    for (const [columns, times] of frequency) {
      if (columns >= 2 && times > dominant) {
        dominant = times;
        dominantColumns = columns;
      }
    }

    const score = dominant * 10 + dominantColumns;
    if (score > bestScore) {
      bestScore = score;
      best = separator;
    }
  }

  return best;
}

function splitRespectingQuotes(line: string, separator: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === separator && !inQuotes) {
      parts.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  parts.push(current);
  return parts;
}

export function parseCsv(
  text: string,
  options: { separator?: string; mapping?: ColumnMapping } = {},
): ParseResult {
  const separator = options.separator ?? detectSeparator(text);

  const parsed = Papa.parse<string[]>(text.trim(), {
    delimiter: separator,
    skipEmptyLines: "greedy",
  });

  const rows = parsed.data.map((row) =>
    row.map((cell) => (typeof cell === "string" ? cell.trim() : String(cell ?? ""))),
  );

  if (rows.length === 0) {
    throw new ParseError("O arquivo CSV está vazio.");
  }

  // As linhas antes da tabela (nome do banco, periodo, titulos) nao tem data.
  // A primeira sem data que anteceda linhas com data e o cabecalho.
  const firstDataIndex = rows.findIndex((row) => !isHeaderRow(row) && row.some(Boolean));
  const headerIndex = findHeaderIndex(rows, firstDataIndex);

  const headers = headerIndex >= 0 ? rows[headerIndex] : null;
  const bodyStart = headerIndex >= 0 ? headerIndex + 1 : 0;
  const body = rows.slice(bodyStart);

  const mapping = options.mapping ?? detectMapping(headers, body);

  if (!mapping) {
    return {
      fileType: "CSV",
      transactions: [],
      warnings: [
        {
          reason:
            "Não foi possível identificar as colunas automaticamente. Escolha manualmente qual coluna é data, descrição e valor.",
        },
      ],
      separator,
      headers: headers ?? undefined,
      sampleRows: rows.slice(0, 12),
    };
  }

  const { transactions, warnings } = rowsToTransactions(body, mapping, {
    firstLine: bodyStart + 1,
  });

  return {
    fileType: "CSV",
    transactions,
    warnings,
    separator,
    headers: headers ?? undefined,
    sampleRows: rows.slice(0, 12),
    mapping,
  };
}

/** O cabecalho e a ultima linha sem data antes do bloco de dados. */
function findHeaderIndex(rows: string[][], firstDataIndex: number): number {
  if (firstDataIndex <= 0) return -1;

  for (let index = firstDataIndex - 1; index >= 0; index -= 1) {
    if (rows[index].filter((cell) => cell.trim()).length >= 2) return index;
  }

  return -1;
}
