import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/** O que a aplicacao precisa saber do usuario autenticado. */
export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

type UserMetadata = {
  full_name?: string;
  name?: string;
};

/**
 * Usuario autenticado, ou null.
 *
 * Usa `getClaims()`, que valida a assinatura do JWT localmente com a chave
 * publica do projeto (em cache), em vez de `getUser()`, que consulta o servidor
 * de auth pela rede. Como o projeto fica em outra regiao, aquele round-trip
 * custava ~200ms em toda pagina renderizada.
 *
 * Segue sendo identidade verificada: o token e conferido criptograficamente,
 * nao apenas lido do cookie.
 *
 * O `cache()` dedupa dentro de um mesmo render - pagina, layout,
 * generateMetadata e helpers de workspace pedem o usuario varias vezes.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) return null;

  const metadata = (claims.user_metadata ?? {}) as UserMetadata;
  const email = typeof claims.email === "string" ? claims.email : "";

  return {
    id: claims.sub,
    email,
    name: metadata.full_name ?? metadata.name ?? email ?? "Usuário",
  };
});

/**
 * Exige sessao. Redireciona para o login quando nao ha usuario.
 * Autenticacao apenas: a autorizacao por workspace vive em
 * src/lib/auth/workspace.ts.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
