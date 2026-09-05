/**
 * Endereco dedicado de ingestao por e-mail (Fase 12), puro e testavel.
 *
 *   <token>@dominio            empresa com uma conta
 *   <token>+<conta>@dominio    empresa com varias contas: a tag e o apelido
 *                              da conta em forma de slug ("conta-corrente")
 */

const TOKEN = /^[a-f0-9]{20}$/;

export type InboundAddress = { token: string; accountTag: string | null };

export function parseInboundAddress(to: string): InboundAddress | null {
  const address = extractEmail(to);
  if (!address) return null;

  const local = address.split("@")[0];
  const [token, tag] = local.split("+");

  if (!TOKEN.test(token)) return null;

  return { token, accountTag: tag ? slugify(tag) : null };
}

/** "Conta Corrente Itaú" -> "conta-corrente-itau" */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "Maria <maria@x.com>" -> "maria@x.com"; sem e-mail -> null. */
export function extractEmail(value: string): string | null {
  const match = /<([^>]+)>/.exec(value) ?? /([^\s<>,;"]+@[^\s<>,;"]+)/.exec(value);
  return match ? match[1].trim().toLowerCase() : null;
}

/** Remetente esta na lista? Comparacao exata, sem diferenciar maiusculas. */
export function isAllowedSender(from: string, allowlist: string[]): boolean {
  const sender = extractEmail(from);
  if (!sender) return false;
  return allowlist.some((allowed) => allowed.trim().toLowerCase() === sender);
}

/** Endereco completo para exibir, ou null sem dominio configurado. */
export function buildInboundAddress(token: string, domain: string | undefined): string | null {
  if (!domain) return null;
  return `${token}@${domain}`;
}
