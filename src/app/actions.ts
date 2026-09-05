"use server";

import { prisma } from "@/lib/prisma";
import { field, firstIssue, parseWaitlist } from "@/lib/validation/schemas";

export type WaitlistState = {
  error?: string;
  success?: string;
};

/**
 * Inscricao na lista de espera (Fase 8; consentimento LGPD na Fase 10).
 *
 * Rota publica sem autenticacao: qualquer um na internet chega aqui. Duas
 * consequencias no codigo abaixo:
 *
 *  - E-mail repetido responde sucesso, nao erro. Alem de ser o que o visitante
 *    espera, mensagem diferente para e-mail ja cadastrado transformaria o
 *    formulario num oraculo de "esse endereco esta na lista?".
 *  - Campo-armadilha invisivel para robo de formulario. Preenchido, a resposta
 *    e o mesmo sucesso de sempre e nada e gravado: dizer "voce e um robo" so
 *    ensina o robo a passar da proxima vez.
 */
export async function joinWaitlistAction(
  _prevState: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const confirmation = "Pronto! Avisamos assim que abrirmos uma vaga.";

  // O campo se chama "website" porque e o nome que robo de formulario adora
  // preencher. Humano nunca ve: fica escondido por CSS e fora da ordem de tab.
  if (field(formData, "website")) return { success: confirmation };

  const parsed = parseWaitlist(formData);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { email, name, office } = parsed.data;
  // O schema ja exigiu a caixa marcada; aqui fica o instante, que e o registro
  // do consentimento. Reinscricao renova a data.
  const consentAt = new Date();

  try {
    await prisma.waitlistEntry.upsert({
      where: { email: email.toLowerCase() },
      create: { email: email.toLowerCase(), name, office, consentAt },
      // Reinscricao atualiza o que veio preenchido e nao apaga o que ja havia.
      update: { name: name ?? undefined, office: office ?? undefined, consentAt },
    });
  } catch (error) {
    console.error("[waitlist]", error);
    return {
      error: "Não foi possível registrar agora. Tente de novo em instantes.",
    };
  }

  return { success: confirmation };
}
