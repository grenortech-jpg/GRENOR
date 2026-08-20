/**
 * Datas de extrato brasileiro (Secao 5.1).
 *
 * Aceita dd/mm/aaaa, dd/mm/aa, aaaa-mm-dd e ddmmaaaa. Ambiguidade resolve
 * como dd/mm, que e o padrao brasileiro: "03/04/2026" e 3 de abril.
 *
 * Toda data volta como UTC meia-noite, porque data de transacao e data civil,
 * sem hora e sem fuso (Secao 2).
 */

/** Ano de dois digitos: 00-69 vira 20xx, 70-99 vira 19xx. */
function expandYear(value: number): number {
  if (value >= 100) return value;
  return value < 70 ? 2000 + value : 1900 + value;
}

function build(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < 1900 || year > 2100) return null;

  const date = new Date(Date.UTC(year, month - 1, day));

  // Rejeita 31/02 e afins, que o Date normalizaria em silencio.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

/** Serial de data do Excel (1 = 1900-01-01, com o bug do ano bissexto de 1900). */
export function parseExcelSerial(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;

  // O Excel considera 1900 bissexto; o epoch efetivo e 1899-12-30.
  const millis = Math.round(serial * 86400000);
  const date = new Date(Date.UTC(1899, 11, 30) + millis);

  // Zera a hora: importa a data civil, nao o instante.
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/**
 * Data no formato do OFX: YYYYMMDD, opcionalmente com hora e fuso
 * ("20260820120000[-3:BRT]"). So a parte da data importa.
 */
export function parseOfxDate(value: string): Date | null {
  const digits = value.trim().replace(/\[.*$/, "");
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(digits);
  if (!match) return null;

  return build(Number(match[1]), Number(match[2]), Number(match[3]));
}

/** Qualquer um dos formatos aceitos em CSV/XLSX. */
export function parseFlexibleDate(input: string): Date | null {
  const text = input.trim();
  if (!text) return null;

  // aaaa-mm-dd (ou aaaa/mm/dd)
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text);
  if (iso) {
    return build(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  // dd/mm/aaaa e dd/mm/aa (aceita / . e -)
  const brazilian = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(text);
  if (brazilian) {
    const day = Number(brazilian[1]);
    const month = Number(brazilian[2]);
    const year = expandYear(Number(brazilian[3]));

    const asBrazilian = build(year, month, day);
    if (asBrazilian) return asBrazilian;

    // Alguns exportadores geram mm/dd mesmo em portugues. So caimos aqui
    // quando dd/mm e impossivel, entao nao ha ambiguidade a resolver.
    return build(year, day, month);
  }

  // Oito digitos colados: ddmmaaaa pelo padrao brasileiro, aaaammdd quando
  // a primeira leitura for impossivel (e o formato que o OFX usa).
  const packed = /^(\d{8})$/.exec(text);
  if (packed) {
    const value = packed[1];
    const asDayFirst = build(
      Number(value.slice(4)),
      Number(value.slice(2, 4)),
      Number(value.slice(0, 2)),
    );
    if (asDayFirst) return asDayFirst;

    return build(
      Number(value.slice(0, 4)),
      Number(value.slice(4, 6)),
      Number(value.slice(6, 8)),
    );
  }

  return null;
}

/** Serve para separar linha de transacao de cabecalho e rodape. */
export function looksLikeDate(value: string): boolean {
  return parseFlexibleDate(value) !== null;
}
