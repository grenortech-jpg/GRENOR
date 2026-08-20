import * as XLSX from "xlsx";

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
 * XLSX: primeira aba por padrao, com seletor de aba no preview (Secao 5.1).
 *
 * As celulas sao lidas como texto formatado (`raw: false`) para que datas e
 * valores cheguem como o usuario os ve na planilha, e daí passem pelas mesmas
 * regras de normalizacao do CSV. Datas em serial numerico continuam sendo
 * tratadas em rowsToTransactions.
 */
export function parseXlsx(
  buffer: Buffer,
  options: { sheetName?: string; mapping?: ColumnMapping } = {},
): ParseResult {
  let workbook: XLSX.WorkBook;

  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: false, raw: false });
  } catch {
    throw new ParseError(
      "Não foi possível abrir a planilha. Verifique se o arquivo é um .xlsx válido.",
    );
  }

  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) {
    throw new ParseError("A planilha não tem nenhuma aba.");
  }

  const sheetName =
    options.sheetName && sheetNames.includes(options.sheetName)
      ? options.sheetName
      : sheetNames[0];

  const sheet = workbook.Sheets[sheetName];

  const raw = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });

  const rows = raw.map((row) =>
    (Array.isArray(row) ? row : []).map((cell) =>
      typeof cell === "string" ? cell.trim() : String(cell ?? "").trim(),
    ),
  );

  if (rows.length === 0) {
    throw new ParseError(`A aba "${sheetName}" está vazia.`);
  }

  const firstDataIndex = rows.findIndex(
    (row) => !isHeaderRow(row) && row.some(Boolean),
  );
  const headerIndex = findHeaderIndex(rows, firstDataIndex);

  const headers = headerIndex >= 0 ? rows[headerIndex] : null;
  const bodyStart = headerIndex >= 0 ? headerIndex + 1 : 0;
  const body = rows.slice(bodyStart);

  const mapping = options.mapping ?? detectMapping(headers, body);

  if (!mapping) {
    return {
      fileType: "XLSX",
      transactions: [],
      warnings: [
        {
          reason:
            "Não foi possível identificar as colunas automaticamente. Escolha manualmente qual coluna é data, descrição e valor.",
        },
      ],
      headers: headers ?? undefined,
      sampleRows: rows.slice(0, 12),
      sheetNames,
      sheetName,
    };
  }

  const { transactions, warnings } = rowsToTransactions(body, mapping, {
    firstLine: bodyStart + 1,
  });

  return {
    fileType: "XLSX",
    transactions,
    warnings,
    headers: headers ?? undefined,
    sampleRows: rows.slice(0, 12),
    mapping,
    sheetNames,
    sheetName,
  };
}

function findHeaderIndex(rows: string[][], firstDataIndex: number): number {
  if (firstDataIndex <= 0) return -1;

  for (let index = firstDataIndex - 1; index >= 0; index -= 1) {
    if (rows[index].filter((cell) => cell.trim()).length >= 2) return index;
  }

  return -1;
}
