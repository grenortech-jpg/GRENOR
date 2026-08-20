import { NextResponse, type NextRequest } from "next/server";

import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Retorno do OAuth (Google). Troca o code do PKCE por uma sessao. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextParam = request.nextUrl.searchParams.get("next");
  const next = nextParam?.startsWith("/") ? nextParam : "/app";
  const siteUrl = await getSiteUrl();

  if (!code) {
    return NextResponse.redirect(`${siteUrl}/login?erro=auth`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${siteUrl}/login?erro=auth`);
  }

  return NextResponse.redirect(`${siteUrl}${next}`);
}
