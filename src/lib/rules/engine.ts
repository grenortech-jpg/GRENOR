import type { RuleMatchType } from "@/generated/prisma/enums";
import { normalizeDescription } from "@/lib/import/normalize";

/**
 * Camada 1 da categorizacao (Secao 5.3): regras do workspace.
 *
 * Deterministico e de custo zero. Roda antes da IA e resolve a maior parte de
 * um extrato brasileiro, porque banco repete descricao: "TAR MANUT CONTA" e
 * sempre tarifa bancaria, em todo mes, para toda empresa.
 */

export type MatchableRule = {
  id: string;
  categoryId: string;
  matchType: RuleMatchType;
  pattern: string;
  priority: number;
  active: boolean;
};

/**
 * A comparacao ignora acento, caixa e espaco duplicado - as tres coisas que
 * mudam de um extrato para outro sem mudar o significado. A descricao original
 * continua intacta no banco.
 */
function forMatching(value: string): string {
  return normalizeDescription(value);
}

export function matchesRule(description: string, rule: MatchableRule): boolean {
  if (!rule.active) return false;

  const haystack = forMatching(description);
  const needle = forMatching(rule.pattern);

  if (!needle) return false;

  switch (rule.matchType) {
    case "CONTAINS":
      return haystack.includes(needle);
    case "STARTS_WITH":
      return haystack.startsWith(needle);
    case "REGEX":
      return matchesRegex(haystack, rule.pattern);
    default:
      return false;
  }
}

/**
 * Regex e a unica forma de match que o usuario escreve livremente, entao o
 * padrao invalido nao pode derrubar a categorizacao inteira: falha em silencio
 * e a regra apenas nao casa.
 */
function matchesRegex(haystack: string, pattern: string): boolean {
  try {
    return new RegExp(pattern, "iu").test(haystack);
  } catch {
    return false;
  }
}

/**
 * Ordena por prioridade (menor numero decide primeiro) e, em empate, pela
 * regra mais especifica - padrao mais longo ganha. Sem esse desempate a ordem
 * dependeria de como o banco devolveu as linhas.
 */
export function sortRules(rules: MatchableRule[]): MatchableRule[] {
  return [...rules].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.pattern.length - a.pattern.length;
  });
}

/** Primeira regra que casa, ou null. */
export function findMatchingRule(
  description: string,
  rules: MatchableRule[],
): MatchableRule | null {
  for (const rule of sortRules(rules)) {
    if (matchesRule(description, rule)) return rule;
  }
  return null;
}

export type CategorizationResult = {
  transactionId: string;
  categoryId: string;
  ruleId: string;
};

/** Aplica as regras a um lote de transacoes. */
export function applyRules(
  transactions: { id: string; description: string }[],
  rules: MatchableRule[],
): CategorizationResult[] {
  const ordered = sortRules(rules);
  const results: CategorizationResult[] = [];

  for (const transaction of transactions) {
    for (const rule of ordered) {
      if (matchesRule(transaction.description, rule)) {
        results.push({
          transactionId: transaction.id,
          categoryId: rule.categoryId,
          ruleId: rule.id,
        });
        break;
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Seguranca do padrao
// ---------------------------------------------------------------------------

/** Um regex mal escrito pode travar o processo inteiro (ReDoS). */
const MAX_PATTERN_LENGTH = 200;
const REGEX_BUDGET_MS = 25;

export type PatternValidation = { ok: true } | { ok: false; reason: string };

/**
 * Valida o padrao no momento de salvar a regra, nao na hora de aplicar.
 *
 * Alem da sintaxe, mede o tempo contra uma entrada adversaria: um padrao com
 * quantificadores aninhados pode levar segundos numa unica descricao e derrubar
 * a aplicacao para todos os workspaces, ja que o processo e compartilhado.
 */
export function validatePattern(
  matchType: RuleMatchType,
  pattern: string,
): PatternValidation {
  const trimmed = pattern.trim();

  if (!trimmed) {
    return { ok: false, reason: "Informe o texto a procurar." };
  }

  if (trimmed.length > MAX_PATTERN_LENGTH) {
    return {
      ok: false,
      reason: `Padrão muito longo (máximo ${MAX_PATTERN_LENGTH} caracteres).`,
    };
  }

  if (matchType !== "REGEX") return { ok: true };

  let expression: RegExp;
  try {
    expression = new RegExp(trimmed, "iu");
  } catch {
    return { ok: false, reason: "Expressão regular inválida." };
  }

  // Entradas que expoem retrocesso catastrofico.
  //
  // Duas escolhas importam aqui. Primeiro, cada sonda termina com um caractere
  // que IMPEDE o casamento: e a falha que obriga o motor a tentar todas as
  // combinacoes. Uma string que casa retorna rapido e nao revela nada.
  //
  // Segundo, as sondas sao curtas de proposito. Medir o tempo depois da
  // execucao so funciona se a execucao terminar: com 24 caracteres um padrao
  // exponencial faz ~16 milhoes de passos, o bastante para estourar o
  // orcamento em milissegundos, e nao os anos que 400 caracteres levariam.
  const adversarial = [
    `${"A".repeat(24)}!`,
    `${"a".repeat(24)}!`,
    `${"0".repeat(24)}!`,
    `${"AB".repeat(12)}!`,
    `${"A ".repeat(12)}!`,
    // Sonda longa e benigna, para padroes de custo quadratico.
    "A B C 123 ".repeat(120),
  ];

  for (const input of adversarial) {
    const start = performance.now();
    try {
      expression.test(input);
    } catch {
      return { ok: false, reason: "Expressão regular inválida." };
    }
    if (performance.now() - start > REGEX_BUDGET_MS) {
      return {
        ok: false,
        reason:
          "Esta expressão é lenta demais e travaria a categorização. Simplifique o padrão.",
      };
    }
  }

  return { ok: true };
}

/** Rotulos dos tipos de comparacao, para a interface. */
export const MATCH_TYPE_LABELS: Record<RuleMatchType, string> = {
  CONTAINS: "Contém",
  STARTS_WITH: "Começa com",
  REGEX: "Expressão regular",
};
