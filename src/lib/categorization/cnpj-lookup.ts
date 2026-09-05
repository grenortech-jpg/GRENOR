import "server-only";

import type { CnpjProfile } from "@/generated/prisma/client";
import { suggestDefaultIdForCnae } from "@/lib/categorization/cnae-map";
import { parseCnpjApiResponse, type CnpjLookupResult } from "@/lib/categorization/cnpj-api";
import { prisma } from "@/lib/prisma";

/**
 * Enriquecimento do CNPJ via APIs publicas e gratuitas (Fase 11), com cache
 * permanente em cnpj_profiles.
 *
 * Ordem: BrasilAPI, depois Minha Receita. Resposta 404 vira cache negativo
 * (o CNPJ nao existe; perguntar de novo nao muda nada). Falha de rede, 429 ou
 * 5xx NAO entra no cache: tenta de novo na proxima rodada.
 *
 * Desligavel por CNPJ_LOOKUP_ENABLED=false (testes, CI e ambientes sem saida
 * para a internet). Sem a consulta, a camada CNPJ so usa o que ja esta em
 * cache.
 */

const TIMEOUT_MS = 5_000;

export function isCnpjLookupEnabled(): boolean {
  return (process.env.CNPJ_LOOKUP_ENABLED ?? "true").toLowerCase() !== "false";
}

type FetchOutcome =
  | { status: "ok"; result: CnpjLookupResult }
  | { status: "not_found" }
  | { status: "unavailable" };

async function fetchFrom(url: string): Promise<FetchOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });

    if (response.status === 404) return { status: "not_found" };
    if (!response.ok) return { status: "unavailable" };

    const parsed = parseCnpjApiResponse(await response.json());
    return parsed ? { status: "ok", result: parsed } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Perfil do CNPJ: do cache, ou consultado e gravado. Devolve null quando nao
 * ha cache e a consulta nao pode ser feita (desligada ou indisponivel).
 */
export async function lookupCnpjProfile(cnpj: string): Promise<CnpjProfile | null> {
  const cached = await prisma.cnpjProfile.findUnique({ where: { cnpj } });
  if (cached) {
    // hits e a metrica de quanto o cache poupa de consulta.
    return prisma.cnpjProfile.update({
      where: { cnpj },
      data: { hits: { increment: 1 } },
    });
  }

  if (!isCnpjLookupEnabled()) return null;

  const sources: Array<[string, string]> = [
    ["brasilapi", `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`],
    ["minhareceita", `https://minhareceita.org/${cnpj}`],
  ];

  let sawNotFound = false;

  for (const [source, url] of sources) {
    const outcome = await fetchFrom(url);

    if (outcome.status === "ok") {
      return prisma.cnpjProfile.create({
        data: {
          cnpj,
          razaoSocial: outcome.result.razaoSocial,
          cnaePrincipal: outcome.result.cnaePrincipal,
          cnaeDescricao: outcome.result.cnaeDescricao,
          suggestedDefaultId: suggestDefaultIdForCnae(outcome.result.cnaePrincipal, "out"),
          source,
        },
      });
    }

    if (outcome.status === "not_found") sawNotFound = true;
  }

  // So e "nao existe" quando alguma API respondeu isso; indisponibilidade
  // nao vira cache.
  if (sawNotFound) {
    return prisma.cnpjProfile.create({
      data: { cnpj, source: "none", notFound: true },
    });
  }

  return null;
}
