import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ALLOWED_TYPES: EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

/**
 * Destino dos links enviados por e-mail (confirmacao de cadastro e
 * recuperacao de senha). Valida o token e abre a sessao.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const nextParam = params.get("next");
  const next = nextParam?.startsWith("/") ? nextParam : "/app";
  const siteUrl = await getSiteUrl();

  if (!tokenHash || !type || !ALLOWED_TYPES.includes(type)) {
    return NextResponse.redirect(`${siteUrl}/login?erro=link`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    return NextResponse.redirect(`${siteUrl}/login?erro=link`);
  }

  return NextResponse.redirect(`${siteUrl}${next}`);
}
