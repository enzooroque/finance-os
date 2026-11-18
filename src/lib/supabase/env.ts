/**
 * Variáveis públicas do Supabase (podem ir para o navegador; a segurança é o RLS).
 * Aceita a chave nova "publishable" ou a antiga "anon".
 * A chave service_role NUNCA é lida pelo app.
 */
export function getSupabaseEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}
