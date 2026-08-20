import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * PDFs gerados, no mesmo bucket privado dos extratos.
 *
 * O acesso e sempre pela aplicacao: o link publico do relatorio serve HTML, e o
 * download do PDF passa por uma URL assinada de curta duracao. Assim o arquivo
 * nao fica exposto num endereco permanente e adivinhavel.
 */
const BUCKET = "extratos";

export function buildReportPath(params: {
  workspaceId: string;
  companyId: string;
  periodId: string;
}): string {
  return `${params.workspaceId}/${params.companyId}/relatorios/${params.periodId}.pdf`;
}

export async function uploadReportPdf(
  path: string,
  pdf: Buffer,
): Promise<void> {
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase.storage.from(BUCKET).upload(path, pdf, {
    contentType: "application/pdf",
    upsert: true,
  });

  if (error) {
    throw new Error(`Falha ao guardar o PDF: ${error.message}`);
  }
}

/** URL temporaria para download, valida por uma hora. */
export async function signedReportUrl(path: string): Promise<string> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600);

  if (error || !data) {
    throw new Error(
      `Não foi possível gerar o link do PDF: ${error?.message ?? "desconhecido"}`,
    );
  }

  return data.signedUrl;
}
