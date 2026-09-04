import * as ExcelJS from "exceljs";

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
 * Le com o exceljs (registry npm, Fase 9) no lugar do SheetJS servido por CDN.
 * As celulas viram texto e seguem pelas mesmas regras de normalizacao do CSV:
 * datas reconhecidas pelo Excel chegam como Date e saem em ISO; numeros saem
 * com duas casas, que e a precisao do centavo; serial de data que o Excel nao
 * formatou como data continua sendo tratado em rowsToTransactions.
 */
export async function parseXlsx(
  buffer: Buffer,
  options: { sheetName?: string; mapping?: ColumnMapping } = {},
): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();

  // O exceljs tipa o parametro com o Buffer nao generico de versoes antigas do
  // @types/node; em runtime aceita Buffer, Uint8Array ou ArrayBuffer.
  const data = buffer as unknown as Parameters<typeof workbook.xlsx.load>[0];

  try {
    await workbook.xlsx.load(data);
  } catch {
    throw new ParseError(
      "Não foi possível abrir a planilha. Verifique se o arquivo é um .xlsx válido.",
    );
  }

  const sheetNames = workbook.worksheets.map((sheet) => sheet.name);
  if (sheetNames.length === 0) {
    throw new ParseError("A planilha não tem nenhuma aba.");
  }

  const sheetName =
    options.sheetName && sheetNames.includes(options.sheetName)
      ? options.sheetName
      : sheetNames[0];

  const sheet = workbook.getWorksheet(sheetName);
  const rows = sheet ? readRows(sheet) : [];

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

/**
 * Linhas da aba como texto, preservando a posicao das colunas (celula vazia
 * vira "") e descartando linhas totalmente vazias.
 */
function readRows(sheet: ExcelJS.Worksheet): string[][] {
  const rows: string[][] = [];

  sheet.eachRow({ includeEmpty: false }, (row) => {
    // row.values e um array de base 1: o indice 0 nao existe.
    const values = row.values as ExcelJS.CellValue[];
    const cells: string[] = [];

    for (let column = 1; column < values.length; column += 1) {
      cells.push(cellToText(values[column]));
    }

    if (cells.some((cell) => cell !== "")) rows.push(cells);
  });

  return rows;
}

/** Converte qualquer valor de celula do exceljs em texto normalizavel. */
function cellToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";

  if (value instanceof Date) return isoCivilDate(value);

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    // Duas casas: o que importa e o centavo. Inteiros (serial de data,
    // numero de documento) ficam como estao.
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  if (typeof value === "string") return value.trim();
  if (typeof value === "boolean") return "";

  if ("richText" in value) {
    return value.richText.map((part) => part.text).join("").trim();
  }

  if ("hyperlink" in value) {
    return cellToText(value.text);
  }

  if ("formula" in value || "sharedFormula" in value) {
    return cellToText(value.result ?? null);
  }

  // { error: "#N/A" } e afins.
  return "";
}

/** O exceljs entrega datas em UTC; o dia civil vem das partes UTC. */
function isoCivilDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function findHeaderIndex(rows: string[][], firstDataIndex: number): number {
  if (firstDataIndex <= 0) return -1;

  for (let index = firstDataIndex - 1; index >= 0; index -= 1) {
    if (rows[index].filter((cell) => cell.trim()).length >= 2) return index;
  }

  return -1;
}
