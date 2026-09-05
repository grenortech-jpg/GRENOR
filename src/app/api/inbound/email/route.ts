import { NextResponse, type NextRequest } from "next/server";

import { ingestStatement } from "@/lib/import/ingest";
import { ParseError } from "@/lib/import/types";
import { isAllowedSender, parseInboundAddress, slugify } from "@/lib/inbound/address";
import { prisma } from "@/lib/prisma";

/**
 * Entrada dos extratos que chegam por e-mail (Fase 12).
 *
 * Quem chama e o Email Worker do Cloudflare (infra/cloudflare/email-worker),
 * que recebe a mensagem no endereco dedicado da empresa, extrai os anexos e
 * os envia aqui em multipart:
 *
 *   Authorization: Bearer <INBOUND_EMAIL_SECRET>
 *   to, from, subject, attachments[]
 *
 * Tres barreiras antes de gravar qualquer coisa: o segredo compartilhado, o
 * token do endereco (aleatorio, unico e trocavel) e a lista de remetentes da
 * empresa. Cada anexo passa pelo mesmo parser, dedupe e Storage da tela.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ATTACHMENTS = 5;

export async function POST(request: NextRequest) {
  const secret = process.env.INBOUND_EMAIL_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Ingestão por e-mail não configurada." }, { status: 503 });
  }

  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const to = String(form.get("to") ?? "");
  const from = String(form.get("from") ?? "");
  const subject = String(form.get("subject") ?? "");

  const address = parseInboundAddress(to);
  if (!address) {
    return NextResponse.json({ error: "Endereço desconhecido." }, { status: 404 });
  }

  const company = await prisma.company.findUnique({
    where: { inboundToken: address.token },
    include: { accounts: { orderBy: { createdAt: "asc" } } },
  });

  if (!company || !company.inboundEnabled) {
    return NextResponse.json({ error: "Endereço desconhecido." }, { status: 404 });
  }

  if (!isAllowedSender(from, company.inboundSenders)) {
    log({ companyId: company.id, outcome: "sender_rejected", from });
    return NextResponse.json({ error: "Remetente não autorizado." }, { status: 403 });
  }

  const account = address.accountTag
    ? company.accounts.find((candidate) => slugify(candidate.nickname) === address.accountTag)
    : company.accounts.length === 1
      ? company.accounts[0]
      : undefined;

  if (!account) {
    const hint =
      company.accounts.length > 1
        ? `A empresa tem ${company.accounts.length} contas; envie para <token>+<conta>@…, com uma destas: ${company.accounts.map((a) => slugify(a.nickname)).join(", ")}.`
        : "A empresa não tem conta bancária cadastrada.";
    return NextResponse.json({ error: hint }, { status: 422 });
  }

  const files = form
    .getAll("attachments")
    .filter((value): value is File => value instanceof File && value.size > 0)
    .slice(0, MAX_ATTACHMENTS);

  if (files.length === 0) {
    return NextResponse.json({ error: "A mensagem não trouxe anexo de extrato." }, { status: 422 });
  }

  const results = [];
  for (const file of files) {
    try {
      const result = await ingestStatement({
        workspaceId: company.workspaceId,
        companyId: company.id,
        accountId: account.id,
        fileName: file.name,
        contentType: file.type,
        buffer: Buffer.from(await file.arrayBuffer()),
        source: "EMAIL",
        senderEmail: from,
      });
      results.push({ file: file.name, ok: true, ...result });
    } catch (error) {
      results.push({
        file: file.name,
        ok: false,
        error: error instanceof ParseError ? error.message : "Falha ao importar.",
      });
      if (!(error instanceof ParseError)) console.error("[inbound]", file.name, error);
    }
  }

  log({
    companyId: company.id,
    outcome: "processed",
    from,
    subject,
    files: results.map((r) => ({ file: r.file, ok: r.ok, imported: "rowsImported" in r ? r.rowsImported : 0 })),
  });

  return NextResponse.json({ company: company.name, account: account.nickname, results });
}

function log(payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ event: "inbound_email", at: new Date().toISOString(), ...payload }));
}
