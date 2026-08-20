import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";

let cached: SupabaseClient | null = null;

/**
 * Cliente com service role. Ignora RLS e nunca pode ser exposto ao browser.
 * Uso previsto: Supabase Storage (extratos, logos, PDFs) e operacoes
 * administrativas de auth.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  if (cached) return cached;

  const config = env();
  cached = createClient(
    config.NEXT_PUBLIC_SUPABASE_URL,
    config.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );

  return cached;
}
