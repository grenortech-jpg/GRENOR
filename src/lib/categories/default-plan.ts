import type { CategoryGroup } from "@/generated/prisma/enums";

/**
 * Plano de contas gerencial padrao (Secao 6 do CLAUDE.md).
 *
 * Estas categorias sao gravadas com `workspaceId = null` (modelo do sistema) e
 * clonadas para cada workspace no onboarding, para que o escritorio possa
 * renomear e acrescentar contas sem afetar os demais.
 *
 * Os ids sao fixos para o seed ser idempotente.
 */
export type DefaultCategory = {
  id: string;
  name: string;
  group: CategoryGroup;
  sortOrder: number;
  isTransferNeutral?: boolean;
};

const id = (n: number) =>
  `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  // 1. RECEITAS
  { id: id(1), name: "Receita de vendas", group: "REVENUE", sortOrder: 10 },
  { id: id(2), name: "Receita de serviços", group: "REVENUE", sortOrder: 20 },
  { id: id(3), name: "Outras receitas", group: "REVENUE", sortOrder: 30 },

  // 2. (-) IMPOSTOS SOBRE VENDAS
  { id: id(4), name: "Simples Nacional / DAS", group: "SALES_TAXES", sortOrder: 110 },
  { id: id(5), name: "ISS", group: "SALES_TAXES", sortOrder: 120 },
  { id: id(6), name: "Outros impostos sobre receita", group: "SALES_TAXES", sortOrder: 130 },

  // 3. (-) CUSTOS VARIAVEIS
  { id: id(7), name: "Fornecedores / CMV", group: "VARIABLE_COSTS", sortOrder: 210 },
  { id: id(8), name: "Comissões", group: "VARIABLE_COSTS", sortOrder: 220 },
  { id: id(9), name: "Taxas de meios de pagamento", group: "VARIABLE_COSTS", sortOrder: 230 },

  // 4. (-) DESPESAS COM PESSOAL
  { id: id(10), name: "Salários", group: "PERSONNEL", sortOrder: 310 },
  { id: id(11), name: "Pró-labore", group: "PERSONNEL", sortOrder: 320 },
  { id: id(12), name: "Encargos (INSS/FGTS)", group: "PERSONNEL", sortOrder: 330 },
  { id: id(13), name: "Benefícios", group: "PERSONNEL", sortOrder: 340 },

  // 5. (-) DESPESAS OPERACIONAIS
  { id: id(14), name: "Aluguel e condomínio", group: "OPERATING_EXPENSES", sortOrder: 410 },
  { id: id(15), name: "Energia, água e internet", group: "OPERATING_EXPENSES", sortOrder: 420 },
  { id: id(16), name: "Software e tecnologia", group: "OPERATING_EXPENSES", sortOrder: 430 },
  { id: id(17), name: "Marketing e comercial", group: "OPERATING_EXPENSES", sortOrder: 440 },
  { id: id(18), name: "Serviços de terceiros", group: "OPERATING_EXPENSES", sortOrder: 450 },
  { id: id(19), name: "Despesas administrativas", group: "OPERATING_EXPENSES", sortOrder: 460 },

  // 6. (-) DESPESAS FINANCEIRAS
  { id: id(20), name: "Tarifas bancárias", group: "FINANCIAL_EXPENSES", sortOrder: 510 },
  { id: id(21), name: "Juros e multas", group: "FINANCIAL_EXPENSES", sortOrder: 520 },

  // 8. INVESTIMENTOS
  { id: id(22), name: "Equipamentos", group: "INVESTMENTS", sortOrder: 610 },
  { id: id(23), name: "Obras e melhorias", group: "INVESTMENTS", sortOrder: 620 },

  // 9. MOVIMENTACOES SOCIETARIAS E EMPRESTIMOS
  { id: id(24), name: "Aportes de sócios", group: "EQUITY_AND_LOANS", sortOrder: 710 },
  { id: id(25), name: "Distribuição de lucros", group: "EQUITY_AND_LOANS", sortOrder: 720 },
  { id: id(26), name: "Empréstimos captados", group: "EQUITY_AND_LOANS", sortOrder: 730 },
  { id: id(27), name: "Parcelas de empréstimos pagas", group: "EQUITY_AND_LOANS", sortOrder: 740 },

  // 11. TRANSFERENCIAS ENTRE CONTAS (neutro, fora dos totais)
  {
    id: id(28),
    name: "Transferência entre contas",
    group: "TRANSFERS",
    sortOrder: 810,
    isTransferNeutral: true,
  },
];

/** Rotulos dos grupos na ordem de apresentacao da DRE (Secao 6). */
export const CATEGORY_GROUP_LABELS: Record<CategoryGroup, string> = {
  REVENUE: "Receitas",
  SALES_TAXES: "(-) Impostos sobre vendas",
  VARIABLE_COSTS: "(-) Custos variáveis",
  PERSONNEL: "(-) Despesas com pessoal",
  OPERATING_EXPENSES: "(-) Despesas operacionais",
  FINANCIAL_EXPENSES: "(-) Despesas financeiras",
  INVESTMENTS: "Investimentos",
  EQUITY_AND_LOANS: "Movimentações societárias e empréstimos",
  TRANSFERS: "Transferências entre contas",
};

/** Ordem de apresentacao dos grupos na DRE de caixa. */
export const CATEGORY_GROUP_ORDER: CategoryGroup[] = [
  "REVENUE",
  "SALES_TAXES",
  "VARIABLE_COSTS",
  "PERSONNEL",
  "OPERATING_EXPENSES",
  "FINANCIAL_EXPENSES",
  "INVESTMENTS",
  "EQUITY_AND_LOANS",
  "TRANSFERS",
];
