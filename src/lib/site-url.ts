import "server-only";

import { headers } from "next/headers";

/**
 * URL publica da aplicacao, usada nos redirects de auth e nos links de
 * relatorio compartilhado. Prefere NEXT_PUBLIC_SITE_URL; sem ela, deduz do
 * cabecalho da requisicao.
 */
export async function getSiteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");

  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const protocol =
    headerList.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");

  return `${protocol}://${host}`;
}
