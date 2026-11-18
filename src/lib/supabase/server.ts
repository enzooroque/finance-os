import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { getSupabaseEnv } from "./env";

/** Cliente Supabase do servidor, agindo como o usuário logado (respeita o RLS). */
export async function createClient() {
  // connection() + cookies() primeiro: marca como "por requisição" (não roda no build) e
  // libera o Supabase para consultar o relógio ao validar a sessão.
  await connection();
  const cookieStore = await cookies();
  const env = getSupabaseEnv();
  if (!env) throw new Error("Supabase não configurado: defina as variáveis em .env.local");
  return createServerClient(env.url, env.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components não podem gravar cookies; o proxy.ts renova a sessão.
        }
      },
    },
  });
}
