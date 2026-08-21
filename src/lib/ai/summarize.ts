import "server-only";

import {
  AI_MODEL,
  getAnthropicClient,
  logAiUsage,
  readUsage,
  type AiUsage,
} from "@/lib/ai/client";
import { classifyFailure, type FailureReason } from "@/lib/ai/categorize";
import {
  buildSummaryPrompt,
  SUMMARY_SYSTEM_PROMPT,
  toPriorPayload,
  toSummaryPayload,
} from "@/lib/ai/summary-prompt";
import type { YearMonth } from "@/lib/period";
import type { PeriodReport } from "@/lib/reports/load";

/**
 * Parecer executivo por IA (Secao 8.2).
 *
 * Uma chamada por acionamento, nao um lote: o texto e curto, sai uma vez por
 * periodo e o limite da Secao 5.6 ja restringe o volume. Falha aqui nao quebra
 * nada - o parecer continua sendo um campo de texto que o usuario escreve a
 * mao (Secao 8.3).
 */

export type SummaryRun =
  | { ok: true; summary: string; usage: AiUsage }
  | { ok: false; reason: FailureReason };

/**
 * Teto de saida.
 *
 * Cobre as 300 palavras pedidas com folga, mais os tokens de raciocinio, que
 * contam para o mesmo teto.
 */
const MAX_TOKENS = 4_096;

export async function generateSummary(params: {
  workspaceId: string;
  company: string;
  report: PeriodReport;
  month: YearMonth;
}): Promise<SummaryRun> {
  const client = getAnthropicClient();

  // Chamador ja checa isAiEnabled; aqui e so a rede de seguranca.
  if (!client) return { ok: false, reason: "auth" };

  const prompt = buildSummaryPrompt({
    company: params.company,
    payload: toSummaryPayload(params.report, params.month),
    prior: toPriorPayload(params.report),
  });

  try {
    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: MAX_TOKENS,
      // Interpretar variacao e atribuir causa provavel e trabalho analitico,
      // entao o raciocinio fica ligado - ao contrario da categorizacao. Mas o
      // esforco fica em medio: a Secao 8.3 da 30s de timeout, e o padrao
      // ("high") arrisca estourar isso em troca de pouco num texto de 300
      // palavras montado sobre numeros ja calculados.
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system: [{ type: "text", text: SUMMARY_SYSTEM_PROMPT }],
      messages: [{ role: "user", content: prompt }],
    });

    const usage = readUsage(response.usage);

    const summary = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!summary) {
      logAiUsage({
        operation: "summary",
        workspaceId: params.workspaceId,
        usage,
        outcome: "invalid_json",
      });
      return { ok: false, reason: "other" };
    }

    logAiUsage({
      operation: "summary",
      workspaceId: params.workspaceId,
      usage,
      outcome: "ok",
    });

    return { ok: true, summary, usage };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("[ai:summary]", message);

    logAiUsage({
      operation: "summary",
      workspaceId: params.workspaceId,
      usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
      outcome: "error",
    });

    return { ok: false, reason: classifyFailure(message) };
  }
}
