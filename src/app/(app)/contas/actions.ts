"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { dbErrorMessage } from "@/lib/db-errors";
import { accountInput } from "@/lib/validation/finance";
import type { ActionResult } from "../transacoes/actions";

export async function saveAccount(raw: unknown): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  const parsed = accountInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "Confira os campos destacados.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const v = parsed.data;
  const fields = {
    name: v.name,
    institution: v.institution || null,
    type: v.type,
    initial_balance_cents: v.initialBalanceCents,
    color: v.color,
    status: v.archived ? "archived" : "active",
    yield_annual_bp: v.yieldAnnualBp,
    yield_cdi_bp: v.yieldCdiBp,
  };

  if (v.id) {
    // A titularidade não muda depois de criada (os lançamentos dependem dela).
    const { data, error } = await supabase.from("accounts").update(fields).eq("id", v.id).select("id");
    if (error) return { ok: false, message: dbErrorMessage(error) };
    if (!data?.length) return { ok: false, message: "Conta não encontrada." };
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
    const { error } = await supabase.from("accounts").insert({
      ...fields,
      owner_user_id: householdId ? null : userId,
      household_id: householdId,
    });
    if (error) return { ok: false, message: dbErrorMessage(error) };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteAccount(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Conta inválida." };
  const { data, error } = await supabase.from("accounts").delete().eq("id", id).select("id");
  if (error) {
    return {
      ok: false,
      message: dbErrorMessage(error, {
        "23503": "Esta conta tem lançamentos ou transferências. Arquive em vez de excluir.",
      }),
    };
  }
  if (!data?.length) return { ok: false, message: "Conta não encontrada." };
  revalidatePath("/", "layout");
  return { ok: true };
}
