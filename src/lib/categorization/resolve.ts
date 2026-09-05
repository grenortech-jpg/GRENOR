import { suggestDefaultIdForCnae } from "@/lib/categorization/cnae-map";
import { extractCnpj } from "@/lib/categorization/cnpj";
import { memoryKey } from "@/lib/categorization/memory-key";
import { applyRules, type MatchableRule } from "@/lib/rules/engine";

/**
 * Resolucao automatica de categoria, na ordem da Fase 11:
 *
 *   memoria do workspace -> CNPJ/CNAE global -> regras -> (IA) -> humano
 *
 * Esta funcao e pura: recebe os lancamentos e funcoes de consulta, e devolve
 * o que atribuir e quantos cada camada resolveu. A IA fica de fora - e uma
 * acao separada, com custo - e "humano" e o que sobra pendente.
 *
 * Quem chama registra a porcentagem por camada em log: e a metrica de custo
 * da categorizacao, que diz quanto ainda vai para a IA.
 */

export type ResolvableTransaction = {
  id: string;
  description: string;
  amountCents: number;
};

export type ResolutionSource = "MEMORY" | "CNPJ" | "RULE";

export type Assignment = {
  transactionId: string;
  categoryId: string;
  source: ResolutionSource;
};

export type ResolutionCounts = {
  total: number;
  memory: number;
  cnpj: number;
  rules: number;
  pending: number;
  /** CNPJs distintos encontrados nas descricoes e quantos foram consultados. */
  cnpjsFound: number;
  cnpjsLookedUp: number;
};

export type CnpjLookup = (cnpj: string) => Promise<{ cnaePrincipal: string | null } | null>;

export type ResolveParams = {
  transactions: ResolvableTransaction[];
  rules: MatchableRule[];
  /** Categorias do workspace com o vinculo a categoria padrao. */
  categories: { id: string; defaultId: string | null }[];
  recall: (keys: string[]) => Promise<Map<string, string>>;
  lookupCnpj: CnpjLookup;
  /** Limite de consultas de CNPJ por rodada (controle de custo/tempo). */
  maxLookups?: number;
};

export const DEFAULT_MAX_LOOKUPS = 30;

export async function resolveCategories(
  params: ResolveParams,
): Promise<{ assignments: Assignment[]; counts: ResolutionCounts }> {
  const { transactions, rules, categories } = params;
  const maxLookups = params.maxLookups ?? DEFAULT_MAX_LOOKUPS;

  const assignments: Assignment[] = [];
  const resolved = new Set<string>();

  // 1. Memoria do workspace
  const keys = transactions.map((transaction) => memoryKey(transaction.description));
  const remembered = await params.recall([...new Set(keys)]);

  transactions.forEach((transaction, index) => {
    const categoryId = remembered.get(keys[index]);
    if (categoryId) {
      assignments.push({ transactionId: transaction.id, categoryId, source: "MEMORY" });
      resolved.add(transaction.id);
    }
  });

  // 2. CNPJ/CNAE global: consulta cada CNPJ uma vez por rodada, ate o limite.
  const byDefaultId = new Map<string, string>();
  for (const category of categories) {
    if (category.defaultId && !byDefaultId.has(category.defaultId)) {
      byDefaultId.set(category.defaultId, category.id);
    }
  }

  const cnpjOf = new Map<string, string>();
  for (const transaction of transactions) {
    if (resolved.has(transaction.id)) continue;
    const cnpj = extractCnpj(transaction.description);
    if (cnpj) cnpjOf.set(transaction.id, cnpj);
  }

  const distinctCnpjs = [...new Set(cnpjOf.values())];
  const cnaeByCnpj = new Map<string, string | null>();
  let lookedUp = 0;

  for (const cnpj of distinctCnpjs) {
    if (lookedUp >= maxLookups) break;
    lookedUp += 1;
    const profile = await params.lookupCnpj(cnpj);
    cnaeByCnpj.set(cnpj, profile?.cnaePrincipal ?? null);
  }

  for (const transaction of transactions) {
    if (resolved.has(transaction.id)) continue;
    const cnpj = cnpjOf.get(transaction.id);
    if (!cnpj || !cnaeByCnpj.has(cnpj)) continue;

    const defaultId = suggestDefaultIdForCnae(
      cnaeByCnpj.get(cnpj),
      transaction.amountCents < 0 ? "out" : "in",
    );
    const categoryId = defaultId ? byDefaultId.get(defaultId) : undefined;

    if (categoryId) {
      assignments.push({ transactionId: transaction.id, categoryId, source: "CNPJ" });
      resolved.add(transaction.id);
    }
  }

  // 3. Regras do workspace
  const forRules = transactions.filter((transaction) => !resolved.has(transaction.id));
  for (const result of applyRules(forRules, rules)) {
    assignments.push({
      transactionId: result.transactionId,
      categoryId: result.categoryId,
      source: "RULE",
    });
    resolved.add(result.transactionId);
  }

  const count = (source: ResolutionSource) =>
    assignments.filter((assignment) => assignment.source === source).length;

  return {
    assignments,
    counts: {
      total: transactions.length,
      memory: count("MEMORY"),
      cnpj: count("CNPJ"),
      rules: count("RULE"),
      pending: transactions.length - resolved.size,
      cnpjsFound: distinctCnpjs.length,
      cnpjsLookedUp: lookedUp,
    },
  };
}

/** Log estruturado da metrica de custo: porcentagem resolvida por camada. */
export function logResolution(workspaceId: string, counts: ResolutionCounts): void {
  const pct = (value: number) =>
    counts.total === 0 ? 0 : Math.round((value / counts.total) * 1000) / 10;

  console.log(
    JSON.stringify({
      event: "categorization_resolve",
      at: new Date().toISOString(),
      workspaceId,
      ...counts,
      pctMemory: pct(counts.memory),
      pctCnpj: pct(counts.cnpj),
      pctRules: pct(counts.rules),
      pctPending: pct(counts.pending),
    }),
  );
}
