import { formatAmount } from "@/lib/format";

/**
 * Prompt de categorizacao em lote (Secao 8.1 do CLAUDE.md).
 *
 * O system prompt e fixo e vem primeiro: fixo no inicio e o que permite cache
 * de prefixo entre lotes (Secao 5.6, controle de custo). A lista de categorias
 * do workspace tambem e estavel entre lotes do mesmo escritorio, entao vem
 * logo depois; so o lote de transacoes varia.
 */

export const CATEGORIZATION_SYSTEM_PROMPT = `Voce e um classificador de transacoes bancarias de empresas brasileiras.
Responda SOMENTE com JSON valido, sem markdown, sem texto fora do JSON.`;

/** Limite da Secao 5.3: ate 50 transacoes por chamada. */
export const MAX_BATCH_SIZE = 50;

/** Limite da Secao 5.6: ate 20 lotes por clique (1.000 transacoes). */
export const MAX_BATCHES_PER_RUN = 20;

/** Limiar da Secao 5.3: abaixo disso vira sugestao, nao categoria. */
export const CONFIDENCE_THRESHOLD = 0.8;

export type PromptCategory = {
  id: string;
  name: string;
  groupLabel: string;
};

export type PromptTransaction = {
  id: string;
  date: Date;
  amountCents: number;
  description: string;
};

/** "id | nome | grupo", uma por linha. */
export function renderCategoryList(categories: PromptCategory[]): string {
  return categories
    .map((category) => `${category.id} | ${category.name} | ${category.groupLabel}`)
    .join("\n");
}

/**
 * "id | data | valor em BRL | descricao", uma por linha.
 *
 * O sinal e preservado: e ele que diz a diferenca entre uma receita e um
 * pagamento com a mesma descricao.
 */
export function renderTransactionList(
  transactions: PromptTransaction[],
): string {
  return transactions
    .map((transaction) => {
      const date = transaction.date.toISOString().slice(0, 10);
      const amount = `${transaction.amountCents < 0 ? "-" : "+"}${formatAmount(
        Math.abs(transaction.amountCents),
      )}`;
      return `${transaction.id} | ${date} | ${amount} | ${transaction.description}`;
    })
    .join("\n");
}

/** Mensagem do usuario, montada por lote, conforme o template da Secao 8.1. */
export function buildCategorizationPrompt(params: {
  categories: PromptCategory[];
  transactions: PromptTransaction[];
}): string {
  return `Plano de contas disponivel (id | nome | grupo):
${renderCategoryList(params.categories)}

Classifique as transacoes abaixo. Para cada uma retorne:
{"results":[{"txId":"...","categoryId":"...","confidence":0.0}]}
Regras:
- confidence entre 0 e 1; use < 0.8 quando houver duvida real.
- Transferencia entre contas da propria empresa: use a categoria de transferencia.
- PIX/TED recebido de pessoa fisica sem contexto: Receita de vendas com confidence <= 0.7.
- Tarifas, IOF, "MANUT CONTA": Tarifas bancarias.

Transacoes (id | data | valor em BRL | descricao):
${renderTransactionList(params.transactions)}`;
}

/** Divide em lotes de ate MAX_BATCH_SIZE. */
export function chunkTransactions<T>(
  transactions: T[],
  size = MAX_BATCH_SIZE,
): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < transactions.length; index += size) {
    batches.push(transactions.slice(index, index + size));
  }
  return batches;
}
