import type { ImportFileType } from "@/generated/prisma/enums";

/** Uma transacao extraida do arquivo, antes de virar linha no banco. */
export type ParsedTransaction = {
  /** Data civil em UTC meia-noite. */
  date: Date;
  /** Descricao original do extrato, preservada para exibicao (Secao 5.1). */
  description: string;
  /** Negativo = saida. */
  amountCents: number;
  /** FITID do OFX, quando existir. */
  fitId?: string;
  /** Linha de origem no arquivo, para o usuario localizar problemas. */
  sourceLine?: number;
};

/**
 * De onde vem cada campo em CSV/XLSX. Indices de coluna (base 0).
 *
 * Bancos brasileiros usam dois desenhos: uma coluna "Valor" com sinal, ou
 * duas colunas separadas de credito e debito. Os dois sao suportados.
 */
export type ColumnMapping = {
  date: number;
  description: number;
  amount?: number;
  credit?: number;
  debit?: number;
};

export type ParseWarning = {
  /** Linha do arquivo (base 1), quando aplicavel. */
  line?: number;
  reason: string;
};

export type ParseResult = {
  fileType: ImportFileType;
  transactions: ParsedTransaction[];
  warnings: ParseWarning[];

  /** Metadados que a tela de preview usa para permitir ajustes. */
  encoding?: string;
  separator?: string;
  headers?: string[];
  /** Amostra das primeiras linhas cruas, para o mapeamento manual. */
  sampleRows?: string[][];
  mapping?: ColumnMapping;
  sheetNames?: string[];
  sheetName?: string;
  /** Identificacao da conta no proprio arquivo (OFX). */
  accountHint?: string;
};

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}
