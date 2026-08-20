import chardet from "chardet";
import iconv from "iconv-lite";

/**
 * Extratos de bancos brasileiros vem com frequencia em latin-1/windows-1252,
 * e o header do OFX costuma mentir sobre isso (Secao 5.1). Por isso a deteccao
 * olha o conteudo, nao o que o arquivo declara.
 */

/** Encodings que realmente aparecem em extrato bancario brasileiro. */
const PLAUSIBLE_ENCODINGS = new Set([
  "utf-8",
  "win1252",
  "windows-1252",
  "iso-8859-15",
  "utf-16le",
  "utf-16be",
]);

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const UTF16LE_BOM = Buffer.from([0xff, 0xfe]);
const UTF16BE_BOM = Buffer.from([0xfe, 0xff]);

export type DecodedFile = {
  text: string;
  encoding: string;
};

function startsWith(buffer: Buffer, prefix: Buffer): boolean {
  return buffer.length >= prefix.length && buffer.subarray(0, prefix.length).equals(prefix);
}

/**
 * Um texto latin-1 mal decodificado como UTF-8 produz U+FFFD. Se aparecer,
 * a decodificacao esta errada, por mais que chardet tenha dito outra coisa.
 */
function hasReplacementChars(text: string): boolean {
  return text.includes("�");
}

export function decodeBuffer(buffer: Buffer): DecodedFile {
  if (startsWith(buffer, UTF8_BOM)) {
    return { text: buffer.subarray(3).toString("utf8"), encoding: "utf-8" };
  }
  if (startsWith(buffer, UTF16LE_BOM)) {
    return { text: iconv.decode(buffer, "utf16-le"), encoding: "utf-16le" };
  }
  if (startsWith(buffer, UTF16BE_BOM)) {
    return { text: iconv.decode(buffer, "utf16-be"), encoding: "utf-16be" };
  }

  const detected = chardet.detect(buffer) ?? "UTF-8";
  const normalized = normalizeEncodingName(detected);

  // O chardet erra feio em arquivos curtos, chegando a apontar encodings
  // asiaticos para meia duzia de bytes latinos. Extrato bancario brasileiro
  // so aparece num punhado de encodings, entao so aceitamos o palpite quando
  // ele cai nesse conjunto.
  if (PLAUSIBLE_ENCODINGS.has(normalized) && iconv.encodingExists(normalized)) {
    const text = iconv.decode(buffer, normalized);
    if (!hasReplacementChars(text)) {
      return { text, encoding: normalized };
    }
  }

  // Fallback na ordem que resolve o caso brasileiro: UTF-8 primeiro (o mais
  // comum hoje), windows-1252 depois (o legado que ainda aparece muito).
  const utf8 = buffer.toString("utf8");
  if (!hasReplacementChars(utf8)) {
    return { text: utf8, encoding: "utf-8" };
  }

  return { text: iconv.decode(buffer, "win1252"), encoding: "windows-1252" };
}

function normalizeEncodingName(name: string): string {
  const lower = name.toLowerCase();
  if (lower === "iso-8859-1" || lower === "latin1") return "win1252";
  if (lower === "ascii" || lower === "us-ascii") return "utf-8";
  return lower;
}
