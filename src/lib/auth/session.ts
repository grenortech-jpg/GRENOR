import "server-only";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Usuario autenticado, ou null. Sempre valida o token no servidor. */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Exige sessao. Redireciona para o login quando nao ha usuario.
 * Autenticacao apenas: a autorizacao por workspace vive em
 * src/lib/auth/workspace.ts (Fase 1).
 */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Nome de exibicao do usuario, com fallback para o e-mail. */
export function displayName(user: User): string {
  const metadata = user.user_metadata as { full_name?: string; name?: string };
  return metadata?.full_name ?? metadata?.name ?? user.email ?? "Usuário";
}
