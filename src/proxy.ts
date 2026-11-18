import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPublicPath } from "@/lib/auth-redirect";
import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * Roda antes de cada página: renova a sessão do Supabase e manda para /login
 * quem não está logado. É a primeira barreira; a segunda é o servidor
 * (lib/auth.ts) e a definitiva é o RLS no banco.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const env = getSupabaseEnv();

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    if (path === "/login" && pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  };

  // Sem Supabase configurado, só a tela de login (que explica a configuração) abre.
  if (!env) return isPublicPath(pathname) ? NextResponse.next() : redirectTo("/login");

  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // getClaims valida o token (não confia cegamente no cookie).
  const { data } = await supabase.auth.getClaims();
  const loggedIn = Boolean(data?.claims?.sub);

  if (!loggedIn && !isPublicPath(pathname)) return redirectTo("/login");
  if (loggedIn && isPublicPath(pathname)) return redirectTo("/");
  return response;
}

export const config = {
  // Ignora arquivos estáticos, ícones, manifest e service worker.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon|sw.js|manifest.webmanifest).*)"],
};
