/**
 * Leitura da resposta das APIs publicas de CNPJ (Fase 11).
 *
 * Separado do modulo de consulta (que e server-only, por usar o Prisma) para
 * ser testado sem o bundler do Next. BrasilAPI e Minha Receita devolvem os
 * mesmos nomes de campo para o que interessa aqui.
 */
export type CnpjLookupResult = {
  razaoSocial: string | null;
  cnaePrincipal: string | null;
  cnaeDescricao: string | null;
};

export function parseCnpjApiResponse(json: unknown): CnpjLookupResult | null {
  if (!json || typeof json !== "object") return null;
  const data = json as Record<string, unknown>;

  const razaoSocial =
    typeof data.razao_social === "string" ? data.razao_social.trim() : null;
  const cnaeRaw = data.cnae_fiscal;
  const cnaePrincipal =
    typeof cnaeRaw === "number" || typeof cnaeRaw === "string"
      ? String(cnaeRaw).replace(/\D/g, "").padStart(7, "0")
      : null;
  const cnaeDescricao =
    typeof data.cnae_fiscal_descricao === "string"
      ? data.cnae_fiscal_descricao.trim()
      : null;

  if (!razaoSocial && !cnaePrincipal) return null;

  return { razaoSocial, cnaePrincipal, cnaeDescricao };
}
