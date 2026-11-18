import "server-only";
import { addMonthsClamped } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { occurrenceDates, type Frequency } from "./planning-math";
import { getViewContext, monthRange } from "./queries";
import type { Scope } from "./types";

type Ctx = Awaited<ReturnType<typeof getViewContext>>;

/** Filtro de visão (pessoal = dono, compartilhado = espaço, consolidado = tudo que o RLS libera). */
function viewFilter(ctx: Ctx): { column: "owner_user_id" | "household_id"; value: string } | null | "empty" {
  if (ctx.view === "pessoal") return { column: "owner_user_id", value: ctx.user.id };
  if (ctx.view === "compartilhado") return ctx.household ? { column: "household_id", value: ctx.household.id } : "empty";
  return null;
}

// ------------------------------------------------------------------ Recorrências
export type Rule = {
  id: string;
  type: "income" | "expense";
  description: string;
  amountCents: number;
  categoryId: string | null;
  categoryName: string | null;
  accountId: string | null;
  frequency: Frequency;
  intervalCount: number;
  startOn: string;
  endOn: string | null;
  scope: Scope;
};

export type Occurrence = {
  ruleId: string;
  dueOn: string;
  amountCents: number;
  status: "pending" | "paid" | "skipped";
  rule: Rule;
};

export async function getRules(ctx: Ctx): Promise<Rule[]> {
  const supabase = await createClient();
  const f = viewFilter(ctx);
  if (f === "empty") return [];
  let q = supabase
      .from("recurring_rules")
      .select("id, type, description, amount_cents, category_id, account_id, frequency, interval_count, start_on, end_on, household_id, category:categories(name)")
      .eq("status", "active")
      .order("description");
  if (f) q = q.eq(f.column, f.value);
  const { data, error } = await q.returns<
    {
      id: string;
      type: Rule["type"];
      description: string;
      amount_cents: number;
      category_id: string | null;
      account_id: string | null;
      frequency: Frequency;
      interval_count: number;
      start_on: string;
      end_on: string | null;
      household_id: string | null;
      category: { name: string } | null;
    }[]
  >();
  if (error) throw new Error("Falha ao carregar contas recorrentes");
  return (data ?? []).map((r) => ({
    id: r.id,
    type: r.type,
    description: r.description,
    amountCents: Number(r.amount_cents),
    categoryId: r.category_id,
    categoryName: r.category?.name ?? null,
    accountId: r.account_id,
    frequency: r.frequency,
    intervalCount: r.interval_count,
    startOn: r.start_on,
    endOn: r.end_on,
    scope: r.household_id ? "shared" : "personal",
  }));
}

/** Ocorrências entre duas datas: datas calculadas pela regra + o que foi gravado (paga/pulada/valor). */
export async function getOccurrences(rules: Rule[], from: string, to: string): Promise<Occurrence[]> {
  if (!rules.length) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("recurring_occurrences")
    .select("rule_id, due_on, amount_cents, status")
    .in("rule_id", rules.map((r) => r.id))
    .gte("due_on", from)
    .lte("due_on", to)
    .returns<{ rule_id: string; due_on: string; amount_cents: number; status: Occurrence["status"] }[]>();
  const saved = new Map((data ?? []).map((o) => [`${o.rule_id}|${o.due_on}`, o]));
  const out: Occurrence[] = [];
  for (const rule of rules) {
    for (const dueOn of occurrenceDates(rule, from, to)) {
      const s = saved.get(`${rule.id}|${dueOn}`);
      out.push({ ruleId: rule.id, dueOn, rule, amountCents: s ? Number(s.amount_cents) : rule.amountCents, status: s?.status ?? "pending" });
    }
  }
  return out.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.rule.description.localeCompare(b.rule.description));
}

// ------------------------------------------------------------------ Metas
export type Goal = {
  id: string;
  name: string;
  targetCents: number;
  savedCents: number;
  deadline: string | null;
  color: string | null;
  scope: Scope;
  /** Média de aportes líquidos dos últimos 3 meses (para a estimativa). */
  avgMonthlyCents: number;
  recent: { id: string; kind: "deposit" | "withdrawal"; amountCents: number; occurredOn: string }[];
};

export async function getGoals(ctx: Ctx, today: string): Promise<Goal[]> {
  const supabase = await createClient();
  const f = viewFilter(ctx);
  if (f === "empty") return [];
  let q = supabase.from("financial_goals").select("id, name, target_cents, deadline, color, household_id").eq("status", "active").order("created_at");
  if (f) q = q.eq(f.column, f.value);
  const { data: goals, error } = await q.returns<
    { id: string; name: string; target_cents: number; deadline: string | null; color: string | null; household_id: string | null }[]
  >();
  if (error) throw new Error("Falha ao carregar metas");
  if (!goals?.length) return [];
  const ids = goals.map((g) => g.id);
  const since = addMonthsClamped(today, -3);
  const [{ data: progress }, { data: moves }] = await Promise.all([
    supabase.from("goal_progress").select("goal_id, saved_cents").in("goal_id", ids).returns<{ goal_id: string; saved_cents: number }[]>(),
    supabase
      .from("goal_contributions")
      .select("id, goal_id, kind, amount_cents, occurred_on")
      .in("goal_id", ids)
      .order("occurred_on", { ascending: false })
      .returns<{ id: string; goal_id: string; kind: "deposit" | "withdrawal"; amount_cents: number; occurred_on: string }[]>(),
  ]);
  const saved = new Map((progress ?? []).map((p) => [p.goal_id, Number(p.saved_cents)]));
  return goals.map((g) => {
    const mine = (moves ?? []).filter((m) => m.goal_id === g.id);
    const net3m = mine
      .filter((m) => m.occurred_on > since)
      .reduce((s, m) => s + (m.kind === "deposit" ? 1 : -1) * Number(m.amount_cents), 0);
    return {
      id: g.id,
      name: g.name,
      targetCents: Number(g.target_cents),
      savedCents: saved.get(g.id) ?? 0,
      deadline: g.deadline,
      color: g.color,
      scope: g.household_id ? "shared" : "personal",
      avgMonthlyCents: Math.floor(Math.max(0, net3m) / 3),
      recent: mine.slice(0, 5).map((m) => ({ id: m.id, kind: m.kind, amountCents: Number(m.amount_cents), occurredOn: m.occurred_on })),
    };
  });
}

// ------------------------------------------------------------------ Orçamentos
export type Budget = {
  id: string;
  categoryId: string;
  categoryName: string;
  color: string | null;
  plannedCents: number;
  usedCents: number;
  previousUsedCents: number;
  scope: Scope;
};

type TxLite = { category_id: string | null; amount_cents: number; household_id: string | null };

/** Gasto por (escopo, categoria-mãe) no mês, por competência. Subcategorias somam na mãe. */
async function spentByCategory(month: string, parentOf: Map<string, string | null>) {
  const supabase = await createClient();
  const [start, end] = monthRange(month);
  const { data } = await supabase
    .from("transactions")
    .select("category_id, amount_cents, household_id")
    .eq("type", "expense")
    .gte("occurred_on", start)
    .lt("occurred_on", end)
    .not("category_id", "is", null)
    .returns<TxLite[]>();
  const totals = new Map<string, number>();
  for (const t of data ?? []) {
    const scope = t.household_id ? "shared" : "personal";
    const cat = t.category_id!;
    const add = (key: string) => totals.set(key, (totals.get(key) ?? 0) + Number(t.amount_cents));
    add(`${scope}|${cat}`);
    const parent = parentOf.get(cat);
    if (parent) add(`${scope}|${parent}`);
  }
  return totals;
}

export async function getBudgets(ctx: Ctx, month: string): Promise<Budget[]> {
  const supabase = await createClient();
  const f = viewFilter(ctx);
  if (f === "empty") return [];
  let q = supabase
    .from("budgets")
    .select("id, category_id, planned_cents, household_id, category:categories(name, color)")
    .eq("month", `${month}-01`);
  if (f) q = q.eq(f.column, f.value);
  const [{ data, error }, { data: cats }] = await Promise.all([
    q.returns<{ id: string; category_id: string; planned_cents: number; household_id: string | null; category: { name: string; color: string | null } | null }[]>(),
    supabase.from("categories").select("id, parent_id").returns<{ id: string; parent_id: string | null }[]>(),
  ]);
  if (error) throw new Error("Falha ao carregar orçamentos");
  const parentOf = new Map((cats ?? []).map((c) => [c.id, c.parent_id]));
  const prevMonth = addMonthsClamped(`${month}-01`, -1).slice(0, 7);
  const [now, prev] = await Promise.all([spentByCategory(month, parentOf), spentByCategory(prevMonth, parentOf)]);
  return (data ?? [])
    .map((b) => {
      const scope: Scope = b.household_id ? "shared" : "personal";
      const key = `${scope}|${b.category_id}`;
      return {
        id: b.id,
        categoryId: b.category_id,
        categoryName: b.category?.name ?? "Categoria",
        color: b.category?.color ?? null,
        plannedCents: Number(b.planned_cents),
        usedCents: now.get(key) ?? 0,
        previousUsedCents: prev.get(key) ?? 0,
        scope,
      };
    })
    .sort((a, b) => a.categoryName.localeCompare(b.categoryName));
}
