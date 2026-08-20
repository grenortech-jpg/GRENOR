import { createHash } from "node:crypto";

/**
 * Normalizacao de descricao e chave de deduplicacao (Secoes 5.1 e 5.2).
 *
 * A descricao original SEMPRE e preservada para exibicao; a versao normalizada
 * existe so para o hash, para que "PIX RECEBIDO  JOÃO" e "Pix recebido João"
 * nao virem dois lancamentos diferentes na reimportacao do mesmo arquivo.
 */

/** Uppercase, sem acentos, espacos colapsados. */
export function normalizeDescription(description: string): string {
  return description
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * sha256 de accountId + data + valor + descricao normalizada (Secao 4).
 *
 * A data entra como AAAA-MM-DD para que o hash nao dependa de fuso nem de
 * representacao interna do Date.
 */
export function dedupeHash(params: {
  accountId: string;
  date: Date;
  amountCents: number;
  description: string;
}): string {
  const day = params.date.toISOString().slice(0, 10);
  const payload = [
    params.accountId,
    day,
    String(params.amountCents),
    normalizeDescription(params.description),
  ].join("|");

  return createHash("sha256").update(payload, "utf8").digest("hex");
}
