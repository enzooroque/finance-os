"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { dbErrorMessage } from "@/lib/db-errors";
import {
  householdNameSchema,
  inviteTokenSchema,
  passwordSchema,
  profileSchema,
  toFieldErrors,
  type FormState,
} from "@/lib/validation/auth";

// Toda ação: 1) confirma o usuário no servidor, 2) valida com Zod, 3) o RLS faz o resto.

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, userId } = await requireUser();
  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName"),
    avatarColor: formData.get("avatarColor"),
  });
  if (!parsed.success) return toFieldErrors(parsed.error);

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.displayName, avatar_color: parsed.data.avatarColor })
    .eq("id", userId);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Perfil atualizado." };
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, email } = await requireUser();
  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return toFieldErrors(parsed.error);

  // Confirma a senha atual antes de trocar (protege contra sessão esquecida aberta).
  const check = await supabase.auth.signInWithPassword({ email, password: parsed.data.currentPassword });
  if (check.error) return { ok: false, fieldErrors: { currentPassword: ["Senha atual incorreta"] } };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (error) {
    console.warn("troca de senha falhou", { code: error.code, status: error.status });
    return {
      ok: false,
      message: error.code === "weak_password" ? "Senha fraca: escolha uma senha mais forte." : dbErrorMessage(null),
    };
  }
  return { ok: true, message: "Senha alterada." };
}

export async function createHousehold(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireUser();
  const parsed = householdNameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return toFieldErrors(parsed.error);

  const { error } = await supabase.rpc("create_household", { p_name: parsed.data.name });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/configuracoes");
  return { ok: true, message: "Espaço criado." };
}

/** Gera o convite. O token volta UMA vez para quem convidou; o banco guarda só o hash. */
export async function createInvite(): Promise<{ token?: string; message?: string }> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("create_household_invite");
  if (error || typeof data !== "string") return { message: dbErrorMessage(error) };
  return { token: data };
}

export async function acceptInvite(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireUser();
  const parsed = inviteTokenSchema.safeParse({ token: formData.get("token") });
  if (!parsed.success) return toFieldErrors(parsed.error);

  const { error } = await supabase.rpc("accept_household_invite", { p_token: parsed.data.token });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Pronto! Você entrou no espaço compartilhado." };
}
