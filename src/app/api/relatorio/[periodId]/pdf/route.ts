import { NextResponse, type NextRequest } from "next/server";

import { getWorkspaceOrThrow } from "@/lib/auth/workspace";
import { prisma } from "@/lib/prisma";
import { renderPdf, wrapForPrint } from "@/lib/reports/pdf";
import { buildReportProps } from "@/lib/reports/render";
import { renderReportHtml } from "@/lib/reports/report-html";
import { buildReportPath, signedReportUrl, uploadReportPdf } from "@/lib/reports/storage";
import { formatMonth } from "@/lib/format";

/**
 * Geracao do PDF do relatorio.
 *
 * Route Handler em runtime nodejs com maxDuration 60 (Secao 2): abrir um
 * Chromium e imprimir uma pagina nao cabe no edge runtime nem nos 10s padrao.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ periodId: string }> },
) {
  const context = await getWorkspaceOrThrow();
  const { periodId } = await params;

  // Barreira da Secao 3: o periodo tem que ser de uma empresa do workspace.
  const period = await prisma.period.findFirst({
    where: {
      id: periodId,
      company: { workspaceId: context.workspace.id },
    },
    include: { company: true },
  });

  if (!period) {
    return NextResponse.json(
      { error: "Período não encontrado." },
      { status: 404 },
    );
  }

  try {
    const props = await buildReportProps({
      companyId: period.companyId,
      workspaceId: context.workspace.id,
      month: { year: period.year, month: period.month },
    });

    const title = `${period.company.name} — ${formatMonth(period.year, period.month)}`;
    const html = wrapForPrint(renderReportHtml(props), title);
    const pdf = await renderPdf(html);

    const path = buildReportPath({
      workspaceId: context.workspace.id,
      companyId: period.companyId,
      periodId: period.id,
    });

    await uploadReportPdf(path, pdf);

    await prisma.report.upsert({
      where: { periodId: period.id },
      create: {
        periodId: period.id,
        pdfUrl: path,
        snapshotJson: props.report as unknown as object,
        generatedAt: new Date(),
      },
      update: { pdfUrl: path, generatedAt: new Date() },
    });

    const url = await signedReportUrl(path);

    return NextResponse.json({
      url,
      fileName: `${slug(period.company.name)}-${period.year}-${String(period.month).padStart(2, "0")}.pdf`,
      sizeBytes: pdf.byteLength,
    });
  } catch (error) {
    console.error("[relatorio:pdf]", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível gerar o PDF.",
      },
      { status: 500 },
    );
  }
}

function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
