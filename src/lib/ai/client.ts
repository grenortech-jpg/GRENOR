import "server-only";

import Anthropic from "@anthropic-ai/sdk";

/**
 * Integracao com a API da Anthropic (Secao 8.3).
 *
 * A aplicacao funciona 100% sem IA: sem AI_ENABLED, as camadas 1 (regras) e 3
 * (revisao manual) da categorizacao seguem funcionando e o parecer executivo
 * vira campo de texto. Nada aqui pode ser caminho obrigatorio.
 */

/**
 * O CLAUDE.md (Secao 8.3) especifica "claude-sonnet mais recente". Para
 * classificacao em lote o sonnet e tambem a escolha economica certa: o volume
 * e alto e a tarefa e simples.
 */
export const AI_MODEL = "claude-sonnet-5";

/** Secao 8.3: timeout de 30s por chamada. */
const TIMEOUT_MS = 30_000;

/** Retry unico com backoff, conforme a Secao 8.3. */
const MAX_RETRIES = 1;

let cached: Anthropic | null = null;

export function isAiEnabled(): boolean {
  return (
    process.env.AI_ENABLED === "true" && Boolean(process.env.ANTHROPIC_API_KEY)
  );
}

/** Cliente configurado, ou null quando a IA esta desligada. */
export function getAnthropicClient(): Anthropic | null {
  if (!isAiEnabled()) return null;
  if (cached) return cached;

  cached = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
  });

  return cached;
}

export type AiUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
};

/**
 * Log estruturado de consumo (Secao 5.6).
 *
 * Sai como uma linha JSON por chamada para que o custo seja somavel depois -
 * por workspace, por operacao e por dia - sem precisar de instrumentacao extra.
 */
export function logAiUsage(params: {
  operation: string;
  workspaceId: string;
  usage: AiUsage;
  batchIndex?: number;
  itemCount?: number;
  outcome: "ok" | "invalid_json" | "error";
}): void {
  console.log(
    JSON.stringify({
      event: "ai_usage",
      at: new Date().toISOString(),
      model: AI_MODEL,
      ...params,
    }),
  );
}

/** Le o consumo da resposta, tolerando campos ausentes. */
export function readUsage(usage: {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}): AiUsage {
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cachedInputTokens: usage.cache_read_input_tokens ?? 0,
  };
}
