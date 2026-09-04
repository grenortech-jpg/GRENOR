import type { ImportFileType } from "@/generated/prisma/enums";
import { parseCsv } from "@/lib/import/csv";
import { decodeBuffer } from "@/lib/import/encoding";
import { parseOfx } from "@/lib/import/ofx";
import {
  ParseError,
  type ColumnMapping,
  type ParseResult,
} from "@/lib/import/types";
import { parseXlsx } from "@/lib/import/xlsx";

/** Limites da Secao 5.6. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS = 10_000;

const XLSX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // zip
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]); // .xls antigo

/**
 * Detecta o formato pelo conteudo, com a extensao apenas como desempate:
 * bancos entregam OFX com extensao .txt e CSV com extensao .xls.
 */
export function detectFileType(
  buffer: Buffer,
  fileName: string,
): ImportFileType | null {
  if (buffer.subarray(0, 4).equals(XLSX_MAGIC)) return "XLSX";

  if (buffer.subarray(0, 4).equals(OLE_MAGIC)) {
    throw new ParseError(
      "Este é um arquivo .xls antigo. Abra no Excel e salve como .xlsx, ou exporte o extrato em OFX ou CSV.",
    );
  }

  const head = buffer.subarray(0, 4096).toString("latin1").toUpperCase();
  if (head.includes("<OFX>") || head.includes("OFXHEADER")) return "OFX";

  const extension = fileName.toLowerCase().split(".").pop();
  if (extension === "ofx") return "OFX";
  if (extension === "xlsx" || extension === "xlsm") return "XLSX";
  if (extension === "csv" || extension === "txt") return "CSV";

  // Sobrou texto com separadores: trata como CSV.
  if (/[;,\t]/.test(head)) return "CSV";

  return null;
}

export type ParseOptions = {
  fileType?: ImportFileType;
  separator?: string;
  sheetName?: string;
  mapping?: ColumnMapping;
};

/**
 * Ponto de entrada da importacao: recebe o arquivo cru e devolve as transacoes
 * normalizadas mais os metadados que o preview usa.
 */
export async function parseStatement(
  buffer: Buffer,
  fileName: string,
  options: ParseOptions = {},
): Promise<ParseResult> {
  if (buffer.length === 0) {
    throw new ParseError("O arquivo está vazio.");
  }

  if (buffer.length > MAX_FILE_BYTES) {
    throw new ParseError(
      "Arquivo maior que 10 MB. Divida o período em partes menores e importe uma de cada vez.",
    );
  }

  const fileType = options.fileType ?? detectFileType(buffer, fileName);

  if (!fileType) {
    throw new ParseError(
      "Formato não reconhecido. Envie o extrato em OFX, CSV ou XLSX.",
    );
  }

  const result = await runParser(buffer, fileType, options);

  if (result.transactions.length > MAX_ROWS) {
    throw new ParseError(
      `O arquivo tem ${result.transactions.length.toLocaleString("pt-BR")} lançamentos, acima do limite de ${MAX_ROWS.toLocaleString("pt-BR")}. Divida o período em partes menores.`,
    );
  }

  return result;
}

async function runParser(
  buffer: Buffer,
  fileType: ImportFileType,
  options: ParseOptions,
): Promise<ParseResult> {
  if (fileType === "XLSX") {
    return parseXlsx(buffer, {
      sheetName: options.sheetName,
      mapping: options.mapping,
    });
  }

  const { text, encoding } = decodeBuffer(buffer);

  if (fileType === "OFX") {
    return { ...parseOfx(text), encoding };
  }

  return {
    ...parseCsv(text, {
      separator: options.separator,
      mapping: options.mapping,
    }),
    encoding,
  };
}
