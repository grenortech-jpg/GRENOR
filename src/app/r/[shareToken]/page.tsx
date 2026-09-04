import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { renderReportHtml } from "@/lib/reports/report-html";
import { formatMonth } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { buildReportProps } from "@/lib/reports/render";

/**
 * Relatorio compartilhado por link (Secao 7).
 *
 * Publico e somente leitura: abre sem login, para o dono da empresa ver o
 * fechamento sem precisar de conta no Finort.
 *
 * Tres barreiras: o token e um UUID aleatorio, o compartilhamento precisa estar
 * ligado, e o periodo precisa estar fechado. Link de um relatorio ainda em
 * edicao nao existe.
 */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ shareToken: string }> };

async function loadShared(shareToken: string) {
  const report = await prisma.report.findUnique({
    where: { shareToken },
    include: { period: { include: { company: true } } },
  });

  if (!report) return null;
  if (!report.shareEnabled) return null;
  if (report.period.status !== "CLOSED") return null;

  return report;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { shareToken } = await params;
  const report = await loadShared(shareToken);

  if (!report) return { title: "Relatório indisponível" };

  return {
    title: `${report.period.company.name} · ${formatMonth(report.period.year, report.period.month)}`,
    // Relatorio financeiro de cliente nao deve ser indexado por buscador.
    robots: { index: false, follow: false },
  };
}

export default async function SharedReportPage({ params }: Params) {
  const { shareToken } = await params;
  const report = await loadShared(shareToken);

  if (!report) notFound();

  const data = await buildReportProps({
    companyId: report.period.companyId,
    workspaceId: report.period.company.workspaceId,
    month: { year: report.period.year, month: report.period.month },
  });

  return (
    <main style={{ background: "#f4f6f9", minHeight: "100svh", padding: "24px 12px" }}>
      <div
        style={{
          maxWidth: 820,
          margin: "0 auto",
          background: "#ffffff",
          borderRadius: 10,
          boxShadow: "0 1px 3px rgba(27, 42, 74, 0.08)",
        }}
      >
        {/* Mesmo HTML que vai para o PDF: uma fonte so, sem divergencia. */}
        <div dangerouslySetInnerHTML={{ __html: renderReportHtml(data) }} />
      </div>

      <p
        style={{
          maxWidth: 820,
          margin: "16px auto 0",
          textAlign: "center",
          fontSize: 12,
          color: "#6b7280",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        Relatório somente leitura, gerado pelo Finort by Grenor.
      </p>
    </main>
  );
}
