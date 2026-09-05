import "server-only";

import type { ImportSource } from "@/generated/prisma/enums";
import { buildDedupeKeys, splitDuplicates } from "@/lib/import/dedupe";
import { MAX_FILE_BYTES, parseStatement } from "@/lib/import/parse";
import { buildStoragePath, uploadStatement } from "@/lib/import/storage";
import { ParseError } from "@/lib/import/types";
import { prisma } from "@/lib/prisma";

/**
 * Importacao sem preview (Fase 12): guarda o arquivo, le, deduplica e grava,
 * tudo de uma vez. E o caminho do e-mail dedicado, onde nao ha ninguem para
 * confirmar - e por isso mesmo reaproveita exatamente o pipeline da tela:
 * parser, dedupeHash e Storage sao os mesmos.
 */
export type IngestResult = {
  batchId: string;
  fileType: string;
  rowsTotal: number;
  rowsImported: number;
  rowsDuplicated: number;
};

export async function ingestStatement(params: {
  workspaceId: string;
  companyId: string;
  accountId: string;
  fileName: string;
  contentType: string;
  buffer: Buffer;
  source: ImportSource;
  senderEmail?: string | null;
}): Promise<IngestResult> {
  if (params.buffer.length === 0) throw new ParseError("O arquivo está vazio.");
  if (params.buffer.length > MAX_FILE_BYTES) {
    throw new ParseError("Arquivo maior que 10 MB.");
  }

  const parsed = await parseStatement(params.buffer, params.fileName);

  const batch = await prisma.importBatch.create({
    data: {
      accountId: params.accountId,
      fileName: params.fileName,
      fileType: parsed.fileType,
      status: "PENDING",
      source: params.source,
      senderEmail: params.senderEmail ?? null,
      rowsTotal: parsed.transactions.length,
    },
  });

  try {
    const path = buildStoragePath({
      workspaceId: params.workspaceId,
      companyId: params.companyId,
      accountId: params.accountId,
      importBatchId: batch.id,
      fileName: params.fileName,
    });
    await uploadStatement(path, params.buffer, params.contentType || "application/octet-stream");

    const keyed = buildDedupeKeys(params.accountId, parsed.transactions);
    const existing = await prisma.transaction.findMany({
      where: { accountId: params.accountId },
      select: { fitId: true, dedupeHash: true },
    });
    const { fresh, duplicates } = splitDuplicates(keyed, existing);

    if (fresh.length > 0) {
      await prisma.transaction.createMany({
        data: fresh.map((transaction) => ({
          accountId: params.accountId,
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
        storagePath: path,
        status: "CONFIRMED",
        rowsImported: fresh.length,
        rowsDuplicated: duplicates.length,
        confirmedAt: new Date(),
      },
    });

    return {
      batchId: batch.id,
      fileType: parsed.fileType,
      rowsTotal: parsed.transactions.length,
      rowsImported: fresh.length,
      rowsDuplicated: duplicates.length,
    };
  } catch (error) {
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}
