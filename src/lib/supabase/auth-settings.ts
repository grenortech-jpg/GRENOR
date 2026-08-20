import "server-only";

import { publicEnv } from "@/lib/env";

type AuthSettings = {
  external?: Record<string, boolean>;
  disable_signup?: boolean;
  mailer_autoconfirm?: boolean;
};

/**
 * Configuracao publica do Supabase Auth (quais providers estao ligados).
 *
 * `signInWithOAuth` nao falha no servidor: ele apenas monta a URL de
 * autorizacao. Se o provider estiver desligado, o erro so aparece quando o
 * navegador chega no Supabase, como um JSON cru. Por isso consultamos o estado
 * antes de oferecer o botao.
 */
async function fetchAuthSettings(): Promise<AuthSettings | null> {
  try {
    const response = await fetch(`${publicEnv.supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: publicEnv.supabaseAnonKey },
      // Muda raramente; 5 minutos evita uma ida a rede por render.
      next: { revalidate: 300 },
    });

    if (!response.ok) return null;
    return (await response.json()) as AuthSettings;
  } catch {
    return null;
  }
}

/**
 * Na duvida, retorna false: e melhor esconder o botao do que mandar o usuario
 * para uma pagina de erro do Supabase.
 */
export async function isOAuthProviderEnabled(
  provider: "google",
): Promise<boolean> {
  const settings = await fetchAuthSettings();
  return settings?.external?.[provider] === true;
}
