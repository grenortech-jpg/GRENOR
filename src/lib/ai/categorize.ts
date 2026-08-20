import "server-only";

import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import {
  AI_MODEL,
  getAnthropicClient,
  logAiUsage,
  readUsage,
} from "@/lib/ai/client";
import {
  buildCategorizationPrompt,
  CATEGORIZATION_SYSTEM_PROMPT,
  CONFIDENCE_THRESHOLD,
  chunkTransactions,
  MAX_BATCHES_PER_RUN,
  type PromptCategory,
  type PromptTransaction,
} from "@/lib/ai/prompt";

/**
 * Camada 2 da categorizacao (Secao 5.3): a IA em lote, para o que as regras
 * nao resolveram.
 *
 * Duas garantias que o resto do sistema depende:
 *
 *  - Falha silenciosa. Se um lote der erro de rede, estourar o timeout ou vier
 *    com JSON invalido duas vezes, aquele lote fica sem categoria e a execucao
 *    continua nos demais. Nada quebra (Secao 8.1).
 *  - Nada abaixo do limiar vira categoria. Palpite com confianca < 0.8 vai para
 *    aiSuggestedCategoryId e continua contando como pendente, para o periodo
 *    nao fechar carregando um chute.
 */

const resultSchema = z.object({
  results: z.array(
    z.object({
      txId: z.string(),
      categoryId: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

export type AiSuggestion = {
  transactionId: string;
  categoryId: string;
  confidence: number;
  /** true quando passa do limiar e pode virar categoria de fato. */
  apply: boolean;
};

/**
 * Por que os lotes falharam, quando falharam.
 *
 * "billing" e "auth" sao problemas que o usuario resolve em um minuto no
 * console da Anthropic. Escondê-los atras de "1 lote falhou" transforma uma
 * correcao trivial numa investigacao.
 */
export type FailureReason = "billing" | "auth" | "rate_limit" | "other";

export type CategorizationRun = {
  suggestions: AiSuggestion[];
  batchesRun: number;
  batchesFailed: number;
  /** Transacoes que ficaram de fora por causa do teto da Secao 5.6. */
  skipped: number;
  inputTokens: number;
  outputTokens: number;
  failureReason?: FailureReason;
};

/** Classifica o erro da API pelo que o usuario pode fazer a respeito. */
export function classifyFailure(message: string): FailureReason {
  const normalized = message.toLowerCase();

  if (normalized.includes("credit balance") || normalized.includes("billing")) {
    return "billing";
  }
  if (
    normalized.includes("authentication") ||
    normalized.includes("invalid x-api-key") ||
    normalized.includes("401")
  ) {
    return "auth";
  }
  if (normalized.includes("rate limit") || normalized.includes("429")) {
    return "rate_limit";
  }
  return "other";
}

export async function categorizeWithAi(params: {
  workspaceId: string;
  categories: PromptCategory[];
  transactions: PromptTransaction[];
}): Promise<CategorizationRun> {
  const client = getAnthropicClient();

  const empty: CategorizationRun = {
    suggestions: [],
    batchesRun: 0,
    batchesFailed: 0,
    skipped: 0,
    inputTokens: 0,
    outputTokens: 0,
  };

  if (!client) return empty;
  if (params.transactions.length === 0) return empty;
  if (params.categories.length === 0) return empty;

  const allBatches = chunkTransactions(params.transactions);
  const batches = allBatches.slice(0, MAX_BATCHES_PER_RUN);

  // Teto de custo por clique (Secao 5.6): o excedente permanece pendente e o
  // usuario decide se roda de novo.
  const skipped = allBatches
    .slice(MAX_BATCHES_PER_RUN)
    .reduce((total, batch) => total + batch.length, 0);

  const run: CategorizationRun = { ...empty, skipped };

  // Sequencial de proposito: paralelizar 20 lotes convida rate limit e tira do
  // usuario qualquer nocao de progresso e de custo.
  for (const [index, batch] of batches.entries()) {
    const valid = new Set(params.categories.map((category) => category.id));
    const ids = new Set(batch.map((transaction) => transaction.id));

    const outcome = await runBatch({
      client,
      workspaceId: params.workspaceId,
      categories: params.categories,
      batch,
      batchIndex: index,
    });

    run.batchesRun += 1;
    run.inputTokens += outcome.usage.inputTokens;
    run.outputTokens += outcome.usage.outputTokens;

    if (!outcome.results) {
      run.batchesFailed += 1;
      if (outcome.failureReason && !run.failureReason) {
        run.failureReason = outcome.failureReason;
      }
      continue;
    }

    for (const result of outcome.results) {
      // O modelo pode devolver id inventado ou de outro lote. Descartar aqui
      // evita gravar categoria de outro workspace ou apontar para o nada.
      if (!ids.has(result.txId)) continue;
      if (!valid.has(result.categoryId)) continue;

      run.suggestions.push({
        transactionId: result.txId,
        categoryId: result.categoryId,
        confidence: result.confidence,
        apply: result.confidence >= CONFIDENCE_THRESHOLD,
      });
    }
  }

  return run;
}

type BatchOutcome = {
  results: z.infer<typeof resultSchema>["results"] | null;
  usage: { inputTokens: number; outputTokens: number };
  failureReason?: FailureReason;
};

async function runBatch(params: {
  client: NonNullable<ReturnType<typeof getAnthropicClient>>;
  workspaceId: string;
  categories: PromptCategory[];
  batch: PromptTransaction[];
  batchIndex: number;
}): Promise<BatchOutcome> {
  const prompt = buildCategorizationPrompt({
    categories: params.categories,
    transactions: params.batch,
  });

  const usage = { inputTokens: 0, outputTokens: 0 };
  let failureReason: FailureReason | undefined;

  // Uma tentativa mais um retry, conforme a Secao 8.1.
  for (let attempt = 0; attempt <= 1; attempt += 1) {
    try {
      const response = await params.client.messages.parse({
        model: AI_MODEL,
        max_tokens: 8192,
        // Classificacao de descricao bancaria nao precisa de raciocinio
        // extenso, e o volume aqui e alto: desligar reduz custo e latencia.
        thinking: { type: "disabled" },
        output_config: {
          effort: "low",
          format: zodOutputFormat(resultSchema),
        },
        system: [
          {
            type: "text",
            text: CATEGORIZATION_SYSTEM_PROMPT,
            // Prefixo estavel entre lotes: o system e a lista de categorias
            // do workspace se repetem, e so o lote muda.
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content:
              attempt === 0
                ? prompt
                : `${prompt}\n\nATENCAO: a resposta anterior nao era JSON valido no formato pedido. Responda SOMENTE com o JSON, sem markdown e sem texto ao redor.`,
          },
        ],
      });

      const batchUsage = readUsage(response.usage);
      usage.inputTokens += batchUsage.inputTokens;
      usage.outputTokens += batchUsage.outputTokens;

      const parsed = response.parsed_output;

      if (!parsed) {
        logAiUsage({
          operation: "categorize",
          workspaceId: params.workspaceId,
          usage: batchUsage,
          batchIndex: params.batchIndex,
          itemCount: params.batch.length,
          outcome: "invalid_json",
        });
        continue;
      }

      logAiUsage({
        operation: "categorize",
        workspaceId: params.workspaceId,
        usage: batchUsage,
        batchIndex: params.batchIndex,
        itemCount: params.batch.length,
        outcome: "ok",
      });

      return { results: parsed.results, usage };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failureReason = classifyFailure(message);

      console.error(
        `[ai:categorize] lote ${params.batchIndex} tentativa ${attempt}:`,
        message,
      );

      logAiUsage({
        operation: "categorize",
        workspaceId: params.workspaceId,
        usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
        batchIndex: params.batchIndex,
        itemCount: params.batch.length,
        outcome: "error",
      });

      // Sem credito ou sem chave valida, tentar de novo so gasta tempo.
      if (failureReason === "billing" || failureReason === "auth") break;

      // Backoff antes do retry unico.
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1_500));
      }
    }
  }

  return { results: null, usage, failureReason };
}
