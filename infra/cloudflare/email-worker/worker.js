import PostalMime from "postal-mime";

/**
 * Email Worker do Finort (Fase 12).
 *
 * Recebe a mensagem enviada ao endereco dedicado da empresa, extrai os anexos
 * de extrato e os entrega a aplicacao em multipart. O Worker nao guarda nada
 * e nao decide nada: quem valida token, remetente e conteudo e a aplicacao.
 *
 * Variaveis (wrangler secret put):
 *   FINORT_INBOUND_URL     https://<seu-dominio>/api/inbound/email
 *   FINORT_INBOUND_SECRET  o mesmo INBOUND_EMAIL_SECRET do .env da aplicacao
 */
const STATEMENT_EXTENSIONS = /\.(ofx|csv|txt|xlsx|xlsm)$/i;

const worker = {
  async email(message, env) {
    const parsed = await PostalMime.parse(message.raw);

    const attachments = (parsed.attachments ?? []).filter((attachment) =>
      STATEMENT_EXTENSIONS.test(attachment.filename ?? ""),
    );

    if (attachments.length === 0) {
      // Sem extrato nao ha o que fazer; rejeitar avisa o remetente.
      message.setReject("Nenhum anexo de extrato (OFX, CSV ou XLSX) na mensagem.");
      return;
    }

    const form = new FormData();
    form.append("to", message.to);
    form.append("from", message.from);
    form.append("subject", parsed.subject ?? "");
    for (const attachment of attachments) {
      form.append(
        "attachments",
        new Blob([attachment.content], { type: attachment.mimeType || "application/octet-stream" }),
        attachment.filename,
      );
    }

    const response = await fetch(env.FINORT_INBOUND_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${env.FINORT_INBOUND_SECRET}` },
      body: form,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      // 4xx e recusa definitiva (remetente, endereco); 5xx pede nova tentativa.
      if (response.status >= 500) throw new Error(`Finort indisponível: ${response.status}`);
      message.setReject(`Finort recusou a mensagem (${response.status}): ${body.slice(0, 200)}`);
    }
  },
};

export default worker;
