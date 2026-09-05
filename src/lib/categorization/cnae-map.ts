import { DEFAULT_CATEGORIES } from "@/lib/categories/default-plan";

/**
 * CNAE -> categoria padrao (Fase 11).
 *
 * Mapeia pela DIVISAO do CNAE (dois primeiros digitos), que e o nivel em que
 * a atividade da contraparte diz algo sobre a natureza do gasto: pagar para
 * quem gera energia (35) e "Energia, agua e internet"; pagar para uma
 * adquirente de cartao (66) e "Taxas de meios de pagamento".
 *
 * Direcao importa: receber de uma adquirente e venda no cartao; receber de
 * qualquer outra empresa nao diz se e venda ou servico, e a resposta e
 * "nao sei" - o lancamento segue para as regras, a IA ou o humano.
 *
 * Os alvos sao NOMES do plano padrao, resolvidos para o id do sistema aqui e
 * para a categoria do workspace via categories.default_id.
 */

type Direction = "in" | "out";

const OUTFLOW_BY_DIVISION: Record<string, string> = {
  // Agro, industria e comercio: insumos e mercadorias
  ...spread(["01", "02", "03"], "Fornecedores / CMV"),
  ...spread(range(10, 33), "Fornecedores / CMV"),
  ...spread(["45", "46", "47"], "Fornecedores / CMV"),

  // Utilidades e telecom
  ...spread(["35", "36", "37", "38", "39", "61"], "Energia, água e internet"),

  // Edicao, TI e software
  ...spread(["58", "59", "60", "62", "63"], "Software e tecnologia"),

  // Financeiro
  "64": "Tarifas bancárias",
  "66": "Taxas de meios de pagamento",
  "65": "Despesas administrativas",

  // Imoveis e aluguel de bens
  "68": "Aluguel e condomínio",
  "77": "Aluguel e condomínio",

  // Servicos profissionais e terceirizados
  ...spread(["69", "70", "71", "74", "78", "80", "81", "82"], "Serviços de terceiros"),
  "73": "Marketing e comercial",

  // Transporte, logistica, alimentacao, educacao, associacoes
  ...spread(["49", "50", "51", "52", "53", "55", "56", "85", "94"], "Despesas administrativas"),

  // Saude: plano de saude e beneficio de pessoal
  ...spread(["86", "87", "88"], "Benefícios"),

  // Administracao publica: guias e taxas
  "84": "Outros impostos sobre receita",
};

const INFLOW_BY_DIVISION: Record<string, string> = {
  // Adquirentes, subadquirentes e bancos liquidando cartao: venda
  "64": "Receita de vendas",
  "66": "Receita de vendas",
};

const DEFAULT_ID_BY_NAME = new Map(
  DEFAULT_CATEGORIES.map((category) => [category.name, category.id]),
);

/** Nomes usados no mapa, para o teste garantir que existem no plano padrao. */
export const CNAE_TARGET_NAMES = [
  ...new Set([...Object.values(OUTFLOW_BY_DIVISION), ...Object.values(INFLOW_BY_DIVISION)]),
];

/**
 * Id da categoria PADRAO sugerida para um CNAE e uma direcao, ou null quando
 * a atividade nao diz nada sobre o lancamento.
 */
export function suggestDefaultIdForCnae(
  cnae: string | null | undefined,
  direction: Direction,
): string | null {
  const digits = (cnae ?? "").replace(/\D/g, "");
  if (digits.length < 2) return null;

  const division = digits.slice(0, 2);
  const name =
    direction === "out" ? OUTFLOW_BY_DIVISION[division] : INFLOW_BY_DIVISION[division];

  return name ? (DEFAULT_ID_BY_NAME.get(name) ?? null) : null;
}

function spread(divisions: string[], name: string): Record<string, string> {
  return Object.fromEntries(divisions.map((division) => [division, name]));
}

function range(from: number, to: number): string[] {
  return Array.from({ length: to - from + 1 }, (_, index) =>
    String(from + index).padStart(2, "0"),
  );
}
