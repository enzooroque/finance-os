"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { dbErrorMessage } from "@/lib/db-errors";
import { addMonthsClamped } from "@/lib/dates";
import { budgetInput, goalInput, goalMovementInput, occurrencePayInput, ruleInput } from "@/lib/validation/finance";
import type { ActionResult } from "./transacoes/actions";

type Supa = Awaited<ReturnType<typeof requireUser>>["supabase"];
const uuid = z.uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const invalid = (e: z.ZodError): ActionResult => ({
  ok: false,
  message: "Confira os campos destacados.",
  fieldErrors: z.flattenError(e).fieldErrors as Record<string, string[]>,
});
const fail = (error: { code?: string; message?: string } | null, overrides?: Record<string, string>): ActionResult => ({
  ok: false,
  message: dbErrorMessage(error, overrides),
});
const done = (): ActionResult => {
  revalidatePath("/", "layout");
  return { ok: true };
};

/** owner/household conforme a titularidade escolhida. */
async function scopeColumns(supabase: Supa, userId: string, scope: "personal" | "shared") {
  if (scope === "personal") return { owner_user_id: userId, household_id: null };
  const { data } = await supabase.from("household_members").select("household_id").eq("user_id", userId).maybeSingle<{ household_id: string }>();
  return data ? { owner_user_id: null, household_id: data.household_id } : null;
}

// ------------------------------------------------------------------ Contas a pagar
export async function saveRule(raw: unknown): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  const parsed = ruleInput.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;
  const fields = {
    type: v.type,
    description: v.description,
    amount_cents: v.amountCents,
    category_id: v.categoryId,
    account_id: v.accountId,
    frequency: v.frequency,
    interval_count: v.intervalCount,
    start_on: v.startOn,
    next_due_on: v.startOn,
    end_on: v.endOn,
  };
  if (v.id) {
    // Editar a série: vale para as próximas ocorrências; as já pagas não mudam.
    const { data, error } = await supabase.from("recurring_rules").update(fields).eq("id", v.id).select("id");
    if (error) return fail(error);
    if (!data?.length) return { ok: false, message: "Conta recorrente não encontrada." };
    return done();
  }
  const scope = await scopeColumns(supabase, userId, v.scope);
  if (!scope) return { ok: false, message: "Crie ou entre em um espaço compartilhado primeiro." };
  const { error } = await supabase.from("recurring_rules").insert({ ...fields, ...scope });
  return error ? fail(error) : done();
}

export async function deleteRule(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!uuid.safeParse(id).success) return { ok: false, message: "Inválido." };
  // Lançamentos já pagos continuam no histórico (perdem só o vínculo com a regra).
  const { data, error } = await supabase.from("recurring_rules").delete().eq("id", id).select("id");
  if (error) return fail(error);
  return data?.length ? done() : { ok: false, message: "Conta recorrente não encontrada." };
}

export async function payOccurrence(raw: unknown): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const parsed = occurrencePayInput.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;
  const { error } = await supabase.rpc("pay_occurrence", {
    p_rule_id: v.ruleId,
    p_due_on: v.dueOn,
    p_account_id: v.accountId,
    p_amount_cents: v.amountCents,
    p_paid_on: v.paidOn,
  });
  return error ? fail(error) : done();
}

export async function skipOccurrence(ruleId: string, dueOn: string, undo = false): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!uuid.safeParse(ruleId).success || !isoDate.safeParse(dueOn).success) return { ok: false, message: "Inválido." };
  const { error } = undo
    ? await supabase.from("recurring_occurrences").delete().eq("rule_id", ruleId).eq("due_on", dueOn).eq("status", "skipped")
    : await supabase.rpc("skip_occurrence", { p_rule_id: ruleId, p_due_on: dueOn });
  return error ? fail(error) : done();
}

export async function setOccurrenceAmount(ruleId: string, dueOn: string, amountCents: number): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!uuid.safeParse(ruleId).success || !isoDate.safeParse(dueOn).success || !Number.isSafeInteger(amountCents) || amountCents <= 0) {
    return { ok: false, message: "Valor inválido." };
  }
  const { error } = await supabase.rpc("set_occurrence_amount", { p_rule_id: ruleId, p_due_on: dueOn, p_amount_cents: amountCents });
  return error ? fail(error) : done();
}

// ------------------------------------------------------------------ Metas
export async function saveGoal(raw: unknown): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  const parsed = goalInput.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;
  const fields = { name: v.name, target_cents: v.targetCents, deadline: v.deadline, color: v.color };
  if (v.id) {
    const { data, error } = await supabase.from("financial_goals").update(fields).eq("id", v.id).select("id");
    if (error) return fail(error);
    return data?.length ? done() : { ok: false, message: "Meta não encontrada." };
  }
  const scope = await scopeColumns(supabase, userId, v.scope);
  if (!scope) return { ok: false, message: "Crie ou entre em um espaço compartilhado primeiro." };
  const { error } = await supabase.from("financial_goals").insert({ ...fields, ...scope });
  return error ? fail(error) : done();
}

export async function deleteGoal(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!uuid.safeParse(id).success) return { ok: false, message: "Inválido." };
  const { data, error } = await supabase.from("financial_goals").delete().eq("id", id).select("id");
  if (error) return fail(error);
  return data?.length ? done() : { ok: false, message: "Meta não encontrada." };
}

export async function addGoalMovement(raw: unknown): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const parsed = goalMovementInput.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;
  const { error } = await supabase.rpc("add_goal_movement", {
    p_goal_id: v.goalId,
    p_kind: v.kind,
    p_amount_cents: v.amountCents,
    p_occurred_on: v.occurredOn,
    p_notes: v.notes,
    p_idempotency_key: v.idempotencyKey,
  });
  return error ? fail(error) : done();
}

// ------------------------------------------------------------------ Orçamentos
export async function saveBudget(raw: unknown): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  const parsed = budgetInput.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;
  const duplicate = { "23505": "Já existe orçamento para esta categoria neste mês." };
  if (v.id) {
    const { data, error } = await supabase.from("budgets").update({ planned_cents: v.plannedCents }).eq("id", v.id).select("id");
    if (error) return fail(error, duplicate);
    return data?.length ? done() : { ok: false, message: "Orçamento não encontrado." };
  }
  const scope = await scopeColumns(supabase, userId, v.scope);
  if (!scope) return { ok: false, message: "Crie ou entre em um espaço compartilhado primeiro." };
  const { error } = await supabase
    .from("budgets")
    .insert({ ...scope, category_id: v.categoryId, month: `${v.month}-01`, planned_cents: v.plannedCents });
  return error ? fail(error, duplicate) : done();
}

export async function deleteBudget(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!uuid.safeParse(id).success) return { ok: false, message: "Inválido." };
  const { data, error } = await supabase.from("budgets").delete().eq("id", id).select("id");
  if (error) return fail(error);
  return data?.length ? done() : { ok: false, message: "Orçamento não encontrado." };
}

/** Copia os orçamentos do mês anterior que ainda não existem neste mês. */
export async function copyPreviousBudgets(month: string): Promise<ActionResult & { copied?: number }> {
  const { supabase } = await requireUser();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, message: "Mês inválido." };
  const prev = addMonthsClamped(`${month}-01`, -1);
  const [{ data: old }, { data: cur }] = await Promise.all([
    supabase.from("budgets").select("owner_user_id, household_id, category_id, planned_cents").eq("month", prev),
    supabase.from("budgets").select("owner_user_id, household_id, category_id").eq("month", `${month}-01`),
  ]);
  const key = (b: { owner_user_id: string | null; household_id: string | null; category_id: string }) =>
    `${b.owner_user_id}|${b.household_id}|${b.category_id}`;
  const existing = new Set((cur ?? []).map(key));
  const rows = (old ?? []).filter((b) => !existing.has(key(b))).map((b) => ({ ...b, month: `${month}-01` }));
  if (!rows.length) return { ok: false, message: "Nada para copiar do mês anterior." };
  const { error } = await supabase.from("budgets").insert(rows);
  if (error) return fail(error);
  revalidatePath("/", "layout");
  return { ok: true, copied: rows.length };
}
