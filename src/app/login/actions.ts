"use server";

import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth-redirect";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, toFieldErrors, type FormState } from "@/lib/validation/auth";

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return toFieldErrors(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Mensagem genérica: não revela se o e-mail existe. Sem logar e-mail/senha.
    console.warn("login falhou", { code: error.code, status: error.status });
    const message =
      error.status === 429
        ? "Muitas tentativas. Aguarde alguns minutos e tente de novo."
        : !error.status || error.status >= 500
          ? "Não foi possível conectar ao servidor. Tente novamente."
          : "E-mail ou senha incorretos.";
    return { ok: false, message };
  }
  redirect(safeNextPath(formData.get("next")));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
