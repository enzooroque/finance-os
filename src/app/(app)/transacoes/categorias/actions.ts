"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { dbErrorMessage } from "@/lib/db-errors";
import { categoryInput } from "@/lib/validation/finance";
import type { ActionResult } from "../actions";

export async function saveCategory(raw: unknown): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  const parsed = categoryInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "Confira os campos destacados.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const v = parsed.data;
  const duplicate = { "23505": "Já existe uma categoria com esse nome aqui." };

  if (v.id) {
    // Tipo e titularidade não mudam depois de criada (lançamentos e orçamentos dependem deles).
    const { data, error } = await supabase
      .from("categories")
      .update({ name: v.name, color: v.color, parent_id: v.parentId })
      .eq("id", v.id)
      .select("id");
    if (error) return { ok: false, message: dbErrorMessage(error, duplicate) };
    if (!data?.length) return { ok: false, message: "Categorias padrão não podem ser editadas." };
  } else {
    let householdId: string | null = null;
    if (v.scope === "shared") {
      const { data } = await supabase
        .from("household_members")
        .select("household_id")
        .eq("user_id", userId)
        .maybeSingle<{ household_id: string }>();
      if (!data) return { ok: false, message: "Crie ou entre em um espaço compartilhado primeiro." };
      householdId = data.household_id;
    }
    const { error } = await supabase.from("categories").insert({
      owner_user_id: householdId ? null : userId,
      household_id: householdId,
      kind: v.kind,
      name: v.name,
      color: v.color,
      parent_id: v.parentId,
    });
    if (error) return { ok: false, message: dbErrorMessage(error, duplicate) };
  }
  revalidatePath("/transacoes", "layout");
  return { ok: true };
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Categoria inválida." };
  // Lançamentos ficam "sem categoria" (ON DELETE SET NULL); subcategorias impedem a exclusão.
  const { data, error } = await supabase.from("categories").delete().eq("id", id).select("id");
  if (error) return { ok: false, message: dbErrorMessage(error, { "23503": "Exclua as subcategorias antes." }) };
  if (!data?.length) return { ok: false, message: "Categorias padrão não podem ser excluídas." };
  revalidatePath("/transacoes", "layout");
  return { ok: true };
}
