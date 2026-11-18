"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { dbErrorMessage, isIdempotencyConflict } from "@/lib/db-errors";
import { getEntryOptions, getHistory, type HistoryEntry } from "@/lib/finance/queries";
import type { EntryOptions } from "@/lib/finance/types";
import { transactionInput, transferInput } from "@/lib/validation/finance";

export type ActionResult = { ok: true } | { ok: false; message: string; fieldErrors?: Record<string, string[] | undefined> };

const fail = (message: string, fieldErrors?: Record<string, string[] | undefined>): ActionResult => ({
  ok: false,
  message,
  fieldErrors,
});

function invalid(error: z.ZodError): ActionResult {
  return fail("Confira os campos destacados.", z.flattenError(error).fieldErrors as Record<string, string[]>);
}

function refresh() {
  revalidatePath("/", "layout");
}

const uuid = z.uuid();

/** Opções do formulário (contas, categorias, membros), carregadas quando o modal abre. */
export async function loadEntryOptions(): Promise<EntryOptions> {
  await requireUser();
  return getEntryOptions();
}

export async function saveTransaction(raw: unknown): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const parsed = transactionInput.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;

  // Tudo numa função SQL só: lançamento + divisão gravados juntos, ou nada.
  const { error } = await supabase.rpc("save_transaction", {
    p_id: v.id,
    p_scope: v.scope,
    p_type: v.type,
    p_amount_cents: v.amountCents,
    p_description: v.description,
    p_category_id: v.categoryId,
    p_occurred_on: v.occurredOn,
    p_account_id: v.accountId,
    p_status: v.status,
    p_paid_on: null,
    p_responsible_user_id: v.responsibleUserId,
    p_is_fixed: v.isFixed,
    p_notes: v.notes,
    p_splits: v.splits.length ? v.splits.map((s) => ({ user_id: s.userId, amount_cents: s.amountCents })) : null,
    p_idempotency_key: v.idempotencyKey,
  });
  if (error) return fail(dbErrorMessage(error));
  refresh();
  return { ok: true };
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!uuid.safeParse(id).success) return fail("Lançamento inválido.");
  // O RLS só deixa apagar o que a pessoa acessa; lançamentos de cartão ficam para a Fase 4.
  const { data, error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", id)
    .is("credit_card_id", null)
    .select("id");
  if (error) return fail(dbErrorMessage(error));
  if (!data?.length) return fail("Lançamento não encontrado.");
  refresh();
  return { ok: true };
}

/** Marca como pago (hoje = data do lançamento) ou volta para pendente. */
export async function setTransactionStatus(id: string, status: "paid" | "pending"): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!uuid.safeParse(id).success || !["paid", "pending"].includes(status)) return fail("Dados inválidos.");
  const { data: row } = await supabase
    .from("transactions")
    .select("occurred_on")
    .eq("id", id)
    .is("credit_card_id", null)
    .maybeSingle<{ occurred_on: string }>();
  if (!row) return fail("Lançamento não encontrado.");
  const { error } = await supabase
    .from("transactions")
    .update({ status, paid_on: status === "paid" ? row.occurred_on : null })
    .eq("id", id);
  if (error) return fail(dbErrorMessage(error));
  refresh();
  return { ok: true };
}

export async function saveTransfer(raw: unknown): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const parsed = transferInput.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;
  const row = {
    from_account_id: v.fromAccountId,
    to_account_id: v.toAccountId,
    amount_cents: v.amountCents,
    occurred_on: v.occurredOn,
    description: v.description || null,
  };
  const { data, error } = v.id
    ? await supabase.from("transfers").update(row).eq("id", v.id).select("id")
    : await supabase.from("transfers").insert({ ...row, idempotency_key: v.idempotencyKey }).select("id");
  // Reenvio do mesmo formulário: já está salvo, não duplica.
  if (error && !isIdempotencyConflict(error)) {
    return fail(dbErrorMessage(error, { "42501": "Você só pode transferir entre contas que você acessa." }));
  }
  if (!error && !data?.length) return fail("Só quem acessa as duas contas pode editar esta transferência.");
  refresh();
  return { ok: true };
}

export async function deleteTransfer(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!uuid.safeParse(id).success) return fail("Transferência inválida.");
  const { data, error } = await supabase.from("transfers").delete().eq("id", id).select("id");
  if (error) return fail(dbErrorMessage(error));
  if (!data?.length) return fail("Só quem acessa as duas contas pode excluir esta transferência.");
  refresh();
  return { ok: true };
}

export async function loadHistory(table: "transactions" | "transfers", id: string): Promise<HistoryEntry[]> {
  await requireUser();
  if (!uuid.safeParse(id).success || !["transactions", "transfers"].includes(table)) return [];
  return getHistory(table, id);
}
