import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Arquivos originais de extrato, no bucket privado `extratos`.
 *
 * O acesso e sempre pela service role, no servidor: o bucket nao tem policy
 * para `anon` nem `authenticated`, entao a API publica de Storage nao alcanca
 * esses arquivos.
 */
const BUCKET = "extratos";

export function buildStoragePath(params: {
  workspaceId: string;
  companyId: string;
  accountId: string;
  importBatchId: string;
  fileName: string;
}): string {
  const extension = params.fileName.toLowerCase().split(".").pop() ?? "dat";
  const safeExtension = /^[a-z0-9]{1,8}$/.test(extension) ? extension : "dat";

  return [
    params.workspaceId,
    params.companyId,
    params.accountId,
    `${params.importBatchId}.${safeExtension}`,
  ].join("/");
}

export async function uploadStatement(
  path: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: true,
  });

  if (error) {
    throw new Error(`Falha ao guardar o arquivo: ${error.message}`);
  }
}

export async function downloadStatement(path: string): Promise<Buffer> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase.storage.from(BUCKET).download(path);

  if (error || !data) {
    throw new Error(
      `Não foi possível recuperar o arquivo enviado: ${error?.message ?? "arquivo ausente"}`,
    );
  }

  return Buffer.from(await data.arrayBuffer());
}

export async function removeStatement(path: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  await supabase.storage.from(BUCKET).remove([path]);
}
