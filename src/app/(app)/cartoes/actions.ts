"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { dbErrorMessage } from "@/lib/db-errors";
import { getEntryOptions } from "@/lib/finance/queries";
import type { EntryOptions } from "@/lib/finance/types";
import { cardInput, paymentInput, purchaseInput } from "@/lib/validation/finance";
import type { ActionResult } from "../transacoes/actions";

const invalid = (e: z.ZodError): ActionResult => ({
  ok: false,
  message: "Confira os campos destacados.",
  fieldErrors: z.flattenError(e).fieldErrors as Record<string, string[]>,
});
const done = (): ActionResult => {
  revalidatePath("/", "layout");
  return { ok: true };
};

/** Contas e categorias para os formulários de compra e pagamento. */
export async function loadCardFormOptions(): Promise<EntryOptions> {
  await requireUser();
  return getEntryOptions();
}

export async function saveCard(raw: unknown): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  const parsed = cardInput.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;
  const fields = {
    name: v.name,
    institution: v.institution || null,
    brand: v.brand,
    last_four: v.lastFour || null,
    limit_cents: v.limitCents,
    closing_day: v.closingDay,
    due_day: v.dueDay,
    color: v.color,
    status: v.archived ? "archived" : "active",
  };
  if (v.id) {
    // Titularidade fixa depois de criado (as compras dependem dela).
    const { data, error } = await supabase.from("credit_cards").update(fields).eq("id", v.id).select("id");
    if (error) return { ok: false, message: dbErrorMessage(error) };
    if (!data?.length) return { ok: false, message: "Cartão não encontrado." };
    return done();
  }
  let householdId: string | null = null;
  if (v.scope === "shared") {
    const { data } = await supabase.from("household_members").select("household_id").eq("user_id", userId).maybeSingle<{ household_id: string }>();
    if (!data) return { ok: false, message: "Crie ou entre em um espaço compartilhado primeiro." };
    householdId = data.household_id;
  }
  const { error } = await supabase
    .from("credit_cards")
    .insert({ ...fields, owner_user_id: householdId ? null : userId, household_id: householdId });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done();
}

export async function deleteCard(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Cartão inválido." };
  const { data, error } = await supabase.from("credit_cards").delete().eq("id", id).select("id");
  if (error) return { ok: false, message: dbErrorMessage(error, { "23503": "Este cartão tem compras. Arquive em vez de excluir." }) };
  if (!data?.length) return { ok: false, message: "Cartão não encontrado." };
  return done();
}

export async function createPurchase(raw: unknown): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const parsed = purchaseInput.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;
  // Função SQL: cria a compra e todas as parcelas nas faturas certas, de uma vez.
  const { error } = await supabase.rpc("create_card_purchase", {
    p_card_id: v.cardId,
    p_description: v.description,
    p_total_cents: v.totalCents,
    p_installments: v.installments,
    p_purchased_on: v.purchasedOn,
    p_category_id: v.categoryId,
    p_idempotency_key: v.idempotencyKey,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done();
}

export async function deletePurchase(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Compra inválida." };
  const { error } = await supabase.rpc("delete_card_purchase", { p_id: id });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done();
}

export async function payStatement(raw: unknown): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const parsed = paymentInput.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;
  const { error } = await supabase.rpc("pay_statement", {
    p_statement_id: v.statementId,
    p_account_id: v.accountId,
    p_amount_cents: v.amountCents,
    p_paid_on: v.paidOn,
    p_idempotency_key: v.idempotencyKey,
  });
  if (error) {
    return { ok: false, message: dbErrorMessage(error, { "42501": "Escolha uma conta que você acessa." }) };
  }
  return done();
}

/** Desfaz um pagamento de fatura lançado errado (o RLS só deixa quem acessa fatura e conta). */
export async function deletePayment(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Pagamento inválido." };
  const { data, error } = await supabase.from("statement_payments").delete().eq("id", id).select("id");
  if (error) return { ok: false, message: dbErrorMessage(error) };
  if (!data?.length) return { ok: false, message: "Pagamento não encontrado." };
  return done();
}
