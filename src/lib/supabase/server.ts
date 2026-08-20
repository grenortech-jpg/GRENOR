import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { publicEnv } from "@/lib/env";

/**
 * Cliente Supabase para Server Components, Server Actions e Route Handlers.
 * Usa a anon key + cookies da sessao: so enxerga o que o usuario autenticado
 * pode ver na API do Supabase (que, para as tabelas financeiras, e nada -
 * os dados sao lidos via Prisma no servidor).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components nao podem escrever cookies. A renovacao de
          // sessao acontece no proxy (src/proxy.ts), entao ignorar aqui e
          // seguro.
        }
      },
    },
  });
}
