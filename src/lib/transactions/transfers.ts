/**
 * Deteccao de transferencias entre contas da mesma empresa (Secao 5.4).
 *
 * Uma transferencia aparece duas vezes no consolidado: sai de uma conta e
 * entra em outra. Se as duas pontas entrarem na DRE, o mes ganha uma receita
 * e uma despesa que nao existiram, e a margem sai errada. Por isso a categoria
 * de transferencia e neutra e fica fora dos totais.
 */

export type TransferCandidate = {
  id: string;
  accountId: string;
  date: Date;
  amountCents: number;
  description: string;
};

export type TransferPair = {
  outgoing: TransferCandidate;
  incoming: TransferCandidate;
  /** Dias entre as duas pontas. */
  gapDays: number;
};

/** Diferenca em dias civis entre duas datas. */
function daysBetween(a: Date, b: Date): number {
  return Math.abs(Math.round((a.getTime() - b.getTime()) / 86_400_000));
}

const MAX_GAP_DAYS = 2;

/**
 * Encontra pares: mesmo valor absoluto, sinais opostos, contas diferentes da
 * mesma empresa, ate dois dias de diferenca.
 *
 * Cada lancamento entra em no maximo um par. Quando ha varios candidatos - tres
 * transferencias de R$ 1.000 na mesma semana - vence o de menor diferenca de
 * dias, e depois a ordem cronologica. Sem esse criterio o resultado mudaria a
 * cada execucao.
 */
export function detectTransferPairs(
  transactions: TransferCandidate[],
): TransferPair[] {
  const outgoing = transactions
    .filter((transaction) => transaction.amountCents < 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const incomingByAmount = new Map<number, TransferCandidate[]>();
  for (const transaction of transactions) {
    if (transaction.amountCents <= 0) continue;
    const bucket = incomingByAmount.get(transaction.amountCents) ?? [];
    bucket.push(transaction);
    incomingByAmount.set(transaction.amountCents, bucket);
  }

  for (const bucket of incomingByAmount.values()) {
    bucket.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  const used = new Set<string>();
  const pairs: TransferPair[] = [];

  for (const debit of outgoing) {
    if (used.has(debit.id)) continue;

    const candidates = incomingByAmount.get(Math.abs(debit.amountCents)) ?? [];

    let best: TransferCandidate | null = null;
    let bestGap = Number.POSITIVE_INFINITY;

    for (const credit of candidates) {
      if (used.has(credit.id)) continue;
      if (credit.accountId === debit.accountId) continue;

      const gap = daysBetween(credit.date, debit.date);
      if (gap > MAX_GAP_DAYS) continue;

      if (gap < bestGap) {
        best = credit;
        bestGap = gap;
      }
    }

    if (best) {
      used.add(debit.id);
      used.add(best.id);
      pairs.push({ outgoing: debit, incoming: best, gapDays: bestGap });
    }
  }

  return pairs;
}
