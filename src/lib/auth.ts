import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Camada de acesso (DAL): toda leitura do usuário logado passa por aqui.
 * Retorna só o necessário para a interface (nunca tokens ou a sessão crua).
 */
export type CurrentUser = {
  id: string;
  email: string;
  displayName: string;
  avatarColor: string;
};

export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_color")
    .eq("id", id)
    .maybeSingle<{ display_name: string; avatar_color: string }>();

  const email = typeof data.claims.email === "string" ? data.claims.email : "";
  return {
    id,
    email,
    displayName: profile?.display_name ?? (email.split("@")[0] || "Usuário"),
    avatarColor: profile?.avatar_color ?? "#7c5cff",
  };
});

/** Para Server Actions: devolve o cliente e o id do usuário, ou interrompe. */
export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) redirect("/login");
  const email = typeof data.claims.email === "string" ? data.claims.email : "";
  return { supabase, userId: id, email };
}
