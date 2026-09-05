import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Rotas que nao exigem sessao. */
const PUBLIC_PREFIXES = [
  "/login",
  "/cadastro",
  "/recuperar-senha",
  "/nova-senha",
  "/auth",
  "/r/", // relatorio compartilhado por link
  "/privacidade", // aviso de privacidade da lista de espera
  "/api/inbound/", // Worker de e-mail, autenticado por segredo proprio
];

/** Rotas de autenticacao das quais um usuario logado deve sair. */
const AUTH_PREFIXES = ["/login", "/cadastro", "/recuperar-senha"];

function isPublic(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Renova a sessao do Supabase e faz a triagem entre rotas publicas e privadas.
 *
 * Usa `getClaims()`, que valida a assinatura do JWT localmente com a chave
 * publica do projeto (em cache), em vez de `getUser()`, que consulta o
 * servidor de auth a cada requisicao. Com getUser, TODA navegacao carregava
 * ~240ms de latencia de rede antes de a pagina comecar a renderizar.
 *
 * Isto e triagem, nao autorizacao. Quem estabelece a identidade de verdade sao
 * `requireUser()` e os helpers de src/lib/auth/workspace.ts, no servidor, ja
 * dentro da pagina ou da Server Action.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          // Respostas que renovam cookies de auth nao podem ser cacheadas.
          for (const [key, headerValue] of Object.entries(headers ?? {})) {
            response.headers.set(key, headerValue);
          }
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const { pathname } = request.nextUrl;

  if (!signedIn && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (signedIn && AUTH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Tudo, exceto arquivos estaticos, imagens otimizadas e os assets do
     * proprio Next em desenvolvimento. Rodar o proxy neles so acrescenta
     * latencia a cada request do navegador. Video da pagina publica (webm,
     * mp4) entra na lista: sem isso o proxy mandava /demo.webm para o login.
     */
    "/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff2?|webm|mp4)$).*)",
  ],
};
