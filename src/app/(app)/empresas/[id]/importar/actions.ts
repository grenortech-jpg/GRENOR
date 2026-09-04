"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { ColumnMapping } from "@/lib/import/types";
import {
  assertAccountInWorkspace,
  getWorkspaceOrThrow,
} from "@/lib/auth/workspace";
import { buildDedupeKeys, splitDuplicates } from "@/lib/import/dedupe";
import { MAX_FILE_BYTES, parseStatement } from "@/lib/import/parse";
import {
  buildStoragePath,
  downloadStatement,
  uploadStatement,
} from "@/lib/import/storage";
import { ParseError } from "@/lib/import/types";
import { formatDate, formatAmount } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { field, firstIssue, parseId } from "@/lib/validation/schemas";

export type PreviewRow = {
  date: string;
  description: string;
  amount: string;
  negative: boolean;
  duplicate: boolean;
};

export type ImportPreview = {
  batchId: string;
  fileName: string;
  fileType: string;
  encoding?: string;
  separator?: string;
  headers?: string[];
  sampleRows?: string[][];
  sheetNames?: string[];
  sheetName?: string;
  mapping?: ColumnMapping;
  /** Mapeamento vigente, ja no formato de campos de formulario. */
  mappingFields: Record<string, string>;
  accountHint?: string;
  rowsTotal: number;
  rowsNew: number;
  rowsDuplicated: number;
  firstDate?: string;
  lastDate?: string;
  inflowCents: number;
  outflowCents: number;
  warnings: string[];
  rows: PreviewRow[];
  needsMapping: boolean;
};

export type ImportState = {
  error?: string;
  preview?: ImportPreview;
};

const mappingSchema = z.object({
  date: z.coerce.number().int().min(0),
  description: z.coerce.number().int().min(0),
  amount: z.coerce.number().int().min(0).optional(),
  credit: z.coerce.number().int().min(0).optional(),
  debit: z.coerce.number().int().min(0).optional(),
});

/**
 * Le o mapeamento manual do formulario, quando o usuario ajustou as colunas.
 *
 * Aceita os dois desenhos de extrato: uma coluna de valor com sinal, ou duas
 * colunas separadas de credito e debito. Um campo vazio significa "nao usar
 * esta coluna", e nao zero - por isso a leitura passa por optional().
 */
function readMapping(formData: FormData): ColumnMapping | undefined {
  const date = field(formData, "map_date");
  const description = field(formData, "map_description");
  const amount = field(formData, "map_amount");
  const credit = field(formData, "map_credit");
  const debit = field(formData, "map_debit");

  if (!date || !description) return undefined;
  if (!amount && !credit && !debit) return undefined;

  const parsed = mappingSchema.safeParse({
    date,
    description,
    ...(amount ? { amount } : {}),
    ...(credit ? { credit } : {}),
    ...(debit ? { debit } : {}),
  });

  return parsed.success ? parsed.data : undefined;
}

/** Repassa o mapeamento vigente adiante, entre preview e confirmacao. */
function mappingFields(mapping?: ColumnMapping): Record<string, string> {
  if (!mapping) return {};

  return {
    map_date: String(mapping.date),
    map_description: String(mapping.description),
    ...(mapping.amount !== undefined ? { map_amount: String(mapping.amount) } : {}),
    ...(mapping.credit !== undefined ? { map_credit: String(mapping.credit) } : {}),
    ...(mapping.debit !== undefined ? { map_debit: String(mapping.debit) } : {}),
  };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ParseError) return error.message;
  console.error("[import]", error);
  return "Não foi possível ler o arquivo. Tente novamente ou envie em outro formato.";
}

/**
 * Passo 1: recebe o arquivo, guarda no Storage, interpreta e devolve o preview.
 * Nada e gravado em Transaction ainda - o lote fica em PARSED ate a confirmacao.
 */
export async function uploadStatementAction(
  _prevState: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const context = await getWorkspaceOrThrow();

  const accountId = parseId(formData, "accountId");
  if (!accountId.success) return { error: firstIssue(accountId.error) };

  const account = await assertAccountInWorkspace(accountId.data, context);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Escolha um arquivo de extrato." };
  }

  if (file.size > MAX_FILE_BYTES) {
    return {
      error:
        "Arquivo maior que 10 MB. Divida o período em partes menores e importe uma de cada vez.",
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let batchId: string | null = null;

  try {
    const parsed = await parseStatement(buffer, file.name);

    const batch = await prisma.importBatch.create({
      data: {
        accountId: account.id,
        fileName: file.name,
        fileType: parsed.fileType,
        status: "PENDING",
        rowsTotal: parsed.transactions.length,
      },
    });
    batchId = batch.id;

    const path = buildStoragePath({
      workspaceId: context.workspace.id,
      companyId: account.companyId,
      accountId: account.id,
      importBatchId: batch.id,
      fileName: file.name,
    });

    await uploadStatement(path, buffer, file.type || "application/octet-stream");

    await prisma.importBatch.update({
      where: { id: batch.id },
      data: { storagePath: path, status: "PARSED" },
    });

    const preview = await buildPreview(batch.id, account.id, file.name, parsed);
    return { preview };
  } catch (error) {
    if (batchId) {
      await prisma.importBatch.update({
        where: { id: batchId },
        data: { status: "FAILED", errorMessage: toErrorMessage(error) },
      });
    }
    return { error: toErrorMessage(error) };
  }
}

/**
 * Passo 2 (opcional): reprocessa o arquivo ja guardado com outra aba ou outro
 * mapeamento de colunas, sem pedir upload de novo.
 */
export async function repreviewAction(
  _prevState: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const context = await getWorkspaceOrThrow();

  const batchId = parseId(formData, "batchId");
  if (!batchId.success) return { error: firstIssue(batchId.error) };

  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId.data },
  });
  if (!batch?.storagePath) return { error: "Importação não encontrada." };

  const account = await assertAccountInWorkspace(batch.accountId, context);

  try {
    const buffer = await downloadStatement(batch.storagePath);
    const parsed = await parseStatement(buffer, batch.fileName, {
      fileType: batch.fileType,
      sheetName: field(formData, "sheetName"),
      separator: field(formData, "separator"),
      mapping: readMapping(formData),
    });

    await prisma.importBatch.update({
      where: { id: batch.id },
      data: { rowsTotal: parsed.transactions.length, status: "PARSED" },
    });

    const preview = await buildPreview(
      batch.id,
      account.id,
      batch.fileName,
      parsed,
    );
    return { preview };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

/** Passo 3: grava as transacoes novas e fecha o lote. */
export async function confirmImportAction(
  _prevState: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const context = await getWorkspaceOrThrow();

  const batchId = parseId(formData, "batchId");
  if (!batchId.success) return { error: firstIssue(batchId.error) };

  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId.data },
  });
  if (!batch?.storagePath) return { error: "Importação não encontrada." };

  if (batch.status === "CONFIRMED") {
    return { error: "Esta importação já foi confirmada." };
  }

  const account = await assertAccountInWorkspace(batch.accountId, context);

  try {
    // Reprocessa a partir do arquivo guardado: o preview nao e fonte de
    // verdade, e o cliente nao dita quais linhas entram.
    const buffer = await downloadStatement(batch.storagePath);
    const parsed = await parseStatement(buffer, batch.fileName, {
      fileType: batch.fileType,
      sheetName: field(formData, "sheetName"),
      separator: field(formData, "separator"),
      mapping: readMapping(formData),
    });

    const keyed = buildDedupeKeys(account.id, parsed.transactions);
    const existing = await prisma.transaction.findMany({
      where: { accountId: account.id },
      select: { fitId: true, dedupeHash: true },
    });

    const { fresh, duplicates } = splitDuplicates(keyed, existing);

    if (fresh.length > 0) {
      await prisma.transaction.createMany({
        data: fresh.map((transaction) => ({
          accountId: account.id,
          importBatchId: batch.id,
          date: transaction.date,
          description: transaction.description,
          amountCents: transaction.amountCents,
          fitId: transaction.fitId ?? null,
          dedupeHash: transaction.dedupeHash,
          categorizedBy: "NONE" as const,
        })),
        skipDuplicates: true,
      });
    }

    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status: "CONFIRMED",
        rowsTotal: parsed.transactions.length,
        rowsImported: fresh.length,
        rowsDuplicated: duplicates.length,
        confirmedAt: new Date(),
      },
    });

    revalidatePath(`/empresas/${account.companyId}`);
    revalidatePath("/app");
  } catch (error) {
    return { error: toErrorMessage(error) };
  }

  redirect(`/empresas/${account.companyId}?importado=${batch.id}`);
}

/** Descarta um lote que ainda nao foi confirmado. */
export async function discardImportAction(
  _prevState: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const context = await getWorkspaceOrThrow();

  const batchId = parseId(formData, "batchId");
  if (!batchId.success) return { error: firstIssue(batchId.error) };

  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId.data },
  });
  if (!batch) return { error: "Importação não encontrada." };

  const account = await assertAccountInWorkspace(batch.accountId, context);

  if (batch.status === "CONFIRMED") {
    return { error: "Importações confirmadas não podem ser descartadas aqui." };
  }

  await prisma.importBatch.delete({ where: { id: batch.id } });

  redirect(`/empresas/${account.companyId}/importar`);
}

/** Monta o resumo que a tela de preview exibe. */
async function buildPreview(
  batchId: string,
  accountId: string,
  fileName: string,
  parsed: Awaited<ReturnType<typeof parseStatement>>,
): Promise<ImportPreview> {
  const keyed = buildDedupeKeys(accountId, parsed.transactions);

  const existing = await prisma.transaction.findMany({
    where: { accountId },
    select: { fitId: true, dedupeHash: true },
  });

  const { fresh, duplicates } = splitDuplicates(keyed, existing);
  const duplicateHashes = new Set(duplicates.map((row) => row.dedupeHash));

  const sorted = [...keyed].sort((a, b) => a.date.getTime() - b.date.getTime());

  const inflowCents = fresh
    .filter((row) => row.amountCents > 0)
    .reduce((total, row) => total + row.amountCents, 0);
  const outflowCents = fresh
    .filter((row) => row.amountCents < 0)
    .reduce((total, row) => total + row.amountCents, 0);

  return {
    batchId,
    fileName,
    fileType: parsed.fileType,
    encoding: parsed.encoding,
    separator: parsed.separator,
    headers: parsed.headers,
    sampleRows: parsed.sampleRows,
    sheetNames: parsed.sheetNames,
    sheetName: parsed.sheetName,
    mapping: parsed.mapping,
    mappingFields: mappingFields(parsed.mapping),
    accountHint: parsed.accountHint,
    rowsTotal: parsed.transactions.length,
    rowsNew: fresh.length,
    rowsDuplicated: duplicates.length,
    firstDate: sorted[0] ? formatDate(sorted[0].date) : undefined,
    lastDate: sorted.at(-1) ? formatDate(sorted.at(-1)!.date) : undefined,
    inflowCents,
    outflowCents,
    warnings: parsed.warnings.slice(0, 20).map((warning) =>
      warning.line ? `Linha ${warning.line}: ${warning.reason}` : warning.reason,
    ),
    rows: sorted.slice(0, 200).map((row) => ({
      date: formatDate(row.date),
      description: row.description,
      // Sem sinal: a tela prefixa "−"/"+" a partir de `negative`; com o sinal
      // do formatador junto, saida aparecia como "−-320,45".
      amount: formatAmount(Math.abs(row.amountCents)),
      negative: row.amountCents < 0,
      duplicate: duplicateHashes.has(row.dedupeHash),
    })),
    // A amostra vai sempre que o formato e tabular: mesmo com deteccao
    // automatica bem-sucedida, o usuario precisa poder corrigir a escolha.
    needsMapping: parsed.transactions.length === 0,
  };
}
