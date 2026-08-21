import "server-only";

import { prisma } from "@/lib/prisma";
import type { YearMonth } from "@/lib/period";

/**
 * Meses com movimento de uma empresa.
 *
 * Existe porque a tabela `Period` so ganha linha quando um mes e FECHADO: uma
 * empresa com tres meses importados e nenhum fechamento tinha historico no
 * banco e nada na tela. Se o mes corrente estivesse vazio, nao havia como
 * chegar a mes nenhum pela interface.
 *
 * Agrupa por ano/mes em SQL, e nao em JavaScript, porque a alternativa seria
 * carregar toda a tabela de lancamentos da empresa a cada visita da pagina so
 * para contar. E o unico $queryRaw do projeto - o Prisma nao expoe agrupamento
 * por parte de data.
 */

export type CompanyMonth = YearMonth & {
  /** Lancamentos no mes. */
  total: number;
  /** Quantos ainda estao sem categoria: o mes nao fecha enquanto houver. */
  pending: number;
  status: "OPEN" | "CLOSED" | null;
};

type MonthRow = {
  year: number;
  month: number;
  total: number;
  pending: number;
};

export async function listCompanyMonths(params: {
  companyId: string;
  workspaceId: string;
  take?: number;
}): Promise<CompanyMonth[]> {
  const take = params.take ?? 12;

  // O workspace entra na propria consulta: o chamador ja passou por
  // assertCompanyInWorkspace, e este e o segundo cinto (Secao 3).
  const rows = await prisma.$queryRaw<MonthRow[]>`
    SELECT
      EXTRACT(YEAR  FROM t.date)::int AS year,
      EXTRACT(MONTH FROM t.date)::int AS month,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE t.category_id IS NULL)::int AS pending
    FROM transactions t
    JOIN bank_accounts a ON a.id = t.account_id
    JOIN companies     c ON c.id = a.company_id
    WHERE c.id = ${params.companyId}::uuid
      AND c.workspace_id = ${params.workspaceId}::uuid
    GROUP BY 1, 2
    ORDER BY 1 DESC, 2 DESC
    LIMIT ${take}
  `;

  if (rows.length === 0) return [];

  const periods = await prisma.period.findMany({
    where: { companyId: params.companyId },
    select: { year: true, month: true, status: true },
  });

  const status = new Map(
    periods.map((period) => [`${period.year}-${period.month}`, period.status]),
  );

  return rows.map((row) => ({
    year: row.year,
    month: row.month,
    total: row.total,
    pending: row.pending,
    status: status.get(`${row.year}-${row.month}`) ?? null,
  }));
}
