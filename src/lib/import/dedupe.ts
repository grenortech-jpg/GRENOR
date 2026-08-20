import { dedupeHash } from "@/lib/import/normalize";
import type { ParsedTransaction } from "@/lib/import/types";

/**
 * Deduplicacao da Secao 5.2.
 *
 *  - Com FITID (OFX): a chave e (accountId, fitId). O banco garante unicidade.
 *  - Sem FITID: dedupeHash de accountId + data + valor + descricao normalizada.
 *
 * Um detalhe que a especificacao nao cobre e que aparece o tempo todo na
 * pratica: duas transacoes legitimamente distintas podem ter data, valor e
 * descricao identicos - dois PIX de R$ 50,00 para o mesmo fornecedor no mesmo
 * dia, duas tarifas iguais. Com o hash puro elas colidiriam e a segunda seria
 * descartada como duplicata, apagando um lancamento real.
 *
 * Por isso a ordem de ocorrencia entra no hash: a primeira "TARIFA -4,90 em
 * 10/08" tem hash #0, a segunda #1. Reimportar o mesmo arquivo continua
 * produzindo exatamente os mesmos hashes (o requisito da Secao 5.2), mas
 * repeticoes legitimas sobrevivem.
 */
export type KeyedTransaction = ParsedTransaction & {
  dedupeHash: string;
};

export function buildDedupeKeys(
  accountId: string,
  transactions: ParsedTransaction[],
): KeyedTransaction[] {
  const seen = new Map<string, number>();

  return transactions.map((transaction) => {
    const base = dedupeHash({
      accountId,
      date: transaction.date,
      amountCents: transaction.amountCents,
      description: transaction.description,
    });

    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);

    return {
      ...transaction,
      dedupeHash:
        occurrence === 0
          ? base
          : dedupeHash({
              accountId,
              date: transaction.date,
              amountCents: transaction.amountCents,
              description: `${transaction.description}#${occurrence}`,
            }),
    };
  });
}

export type DedupeResult = {
  fresh: KeyedTransaction[];
  duplicates: KeyedTransaction[];
};

/**
 * Separa o que ja existe na conta do que e novo, considerando as duas chaves.
 */
export function splitDuplicates(
  keyed: KeyedTransaction[],
  existing: { fitId: string | null; dedupeHash: string }[],
): DedupeResult {
  const existingFitIds = new Set(
    existing.map((row) => row.fitId).filter((fitId): fitId is string => Boolean(fitId)),
  );
  const existingHashes = new Set(existing.map((row) => row.dedupeHash));

  const fresh: KeyedTransaction[] = [];
  const duplicates: KeyedTransaction[] = [];

  for (const transaction of keyed) {
    const byFitId = transaction.fitId && existingFitIds.has(transaction.fitId);
    const byHash = existingHashes.has(transaction.dedupeHash);

    if (byFitId || byHash) {
      duplicates.push(transaction);
    } else {
      fresh.push(transaction);
      // Protege contra repeticao dentro do proprio lote.
      if (transaction.fitId) existingFitIds.add(transaction.fitId);
      existingHashes.add(transaction.dedupeHash);
    }
  }

  return { fresh, duplicates };
}
