import "server-only";
import { addMonthsClamped, daysInMonth } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { balanceHistory, expensesByCategory, lastMonths, monthlyTotals, type TxLite } from "./analytics-math";
import { getCards } from "./cards";
import { getGoals, getOccurrences, getRules, getBudgets } from "./planning";
import { budgetLevel } from "./planning-math";
import { getAccounts, getCategories, getTransactions, getViewContext, monthRange } from "./queries";
import { statementState } from "./statement";

type Ctx = Awaited<ReturnType<typeof getViewContext>>;

function viewFilter(ctx: Ctx): { column: "owner_user_id" | "household_id"; value: string } | null | "empty" {
  if (ctx.view === "pessoal") return { column: "owner_user_id", value: ctx.user.id };
  if (ctx.view === "compartilhado") return ctx.household ? { column: "household_id", value: ctx.household.id } : "empty";
  return null;
}

/** Lançamentos (receita/despesa) da visão entre duas datas, só as colunas necessárias. */
async function txBetween(ctx: Ctx, from: string, toExclusive: string) {
  const f = viewFilter(ctx);
  if (f === "empty") return [] as (TxLite & { account_id: string | null; status: string; paid_on: string | null; is_fixed: boolean })[];
  const supabase = await createClient();
  let q = supabase
    .from("transactions")
    .select("type, amount_cents, occurred_on, category_id, account_id, status, paid_on, is_fixed")
    .gte("occurred_on", from)
    .lt("occurred_on", toExclusive);
  if (f) q = q.eq(f.column, f.value);
  // shortcut: agrega no app; para muitos anos de dados, mover para uma função SQL.
  const { data, error } = await q.returns<(TxLite & { account_id: string | null; status: string; paid_on: string | null; is_fixed: boolean })[]>();
  if (error) throw new Error("Falha ao carregar dados do painel");
  return data ?? [];
}

export async function getDashboardData(ctx: Ctx, month: string, today: string) {
  const months = lastMonths(month, 6);
  const [rangeStart] = monthRange(months[0]);
  const [, rangeEnd] = monthRange(today.slice(0, 7) > month ? today.slice(0, 7) : month);
  const monthEnd = `${month}-${String(daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)))).padStart(2, "0")}`;

  const [accounts, rows, categories, cards, rules, goals, budgets, recent] = await Promise.all([
    getAccounts(ctx),
    txBetween(ctx, rangeStart, rangeEnd),
    getCategories(),
    getCards(ctx),
    getRules(ctx),
    getGoals(ctx, today),
    getBudgets(ctx, month),
    getTransactions(ctx, { month, sort: "date_desc", page: 1 }),
  ]);

  const series = monthlyTotals(rows, months);
  const current = series[series.length - 1];
  const previous = series[series.length - 2];
  const totalBalance = accounts.reduce((s, a) => s + a.balanceCents, 0);

  // Fluxo de caixa líquido por mês (só o que já foi pago, em contas): base da evolução do saldo.
  // shortcut: transferências e pagamentos de fatura não entram aqui (em "consolidado" se anulam
  // em boa parte); a curva é uma aproximação do saldo, o número de hoje é exato.
  const net = new Map<string, number>();
  for (const r of rows) {
    if (!r.account_id || r.status !== "paid" || !r.paid_on) continue;
    const m = r.paid_on.slice(0, 7);
    net.set(m, (net.get(m) ?? 0) + (r.type === "income" ? 1 : -1) * Number(r.amount_cents));
  }
  const balances = balanceHistory(totalBalance, months, net, today);

  const monthRows = rows.filter((r) => r.occurred_on.startsWith(month));
  const byCategory = expensesByCategory(monthRows, categories);

  // Próximas contas (7 dias) e atrasadas
  const in7days = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 864e5).toISOString().slice(0, 10);
  const [upcoming, overdueAll] = await Promise.all([
    getOccurrences(rules, today, in7days),
    getOccurrences(rules, addMonthsClamped(today, -3), today),
  ]);
  const overdue = overdueAll.filter((o) => o.status === "pending" && o.dueOn < today);

  // Previsão do mês corrente: saldo + o que ainda vai entrar/sair (pendentes e contas fixas)
  const pendingTx = rows
    .filter((r) => r.account_id && r.status === "pending" && r.occurred_on.startsWith(today.slice(0, 7)))
    .reduce((s, r) => s + (r.type === "income" ? 1 : -1) * Number(r.amount_cents), 0);
  const restOfMonth = await getOccurrences(rules, today, `${today.slice(0, 7)}-${String(daysInMonth(Number(today.slice(0, 4)), Number(today.slice(5, 7)))).padStart(2, "0")}`);
  const pendingBills = restOfMonth
    .filter((o) => o.status === "pending")
    .reduce((s, o) => s + (o.rule.type === "income" ? 1 : -1) * o.amountCents, 0);

  // Faturas em aberto (a pagar) por cartão
  const supabase = await createClient();
  const cardIds = cards.map((c) => c.id);
  const { data: stmts } = cardIds.length
    ? await supabase
        .from("statement_summaries")
        .select("id, credit_card_id, closing_date, due_date, total_cents, paid_cents")
        .in("credit_card_id", cardIds)
        .order("due_date")
        .returns<{ id: string; credit_card_id: string; closing_date: string; due_date: string; total_cents: number; paid_cents: number }[]>()
    : { data: [] };
  const openStatements = (stmts ?? [])
    .map((s) => ({ ...s, total: Number(s.total_cents), paid: Number(s.paid_cents) }))
    .filter((s) => s.total > s.paid && ["closed", "partial", "open"].includes(statementState({ closingDate: s.closing_date, totalCents: s.total, paidCents: s.paid }, today)))
    .filter((s, i, all) => all.findIndex((x) => x.credit_card_id === s.credit_card_id) === i) // a mais próxima de cada cartão
    .map((s) => ({ cardName: cards.find((c) => c.id === s.credit_card_id)?.name ?? "Cartão", cardId: s.credit_card_id, dueDate: s.due_date, remainingCents: s.total - s.paid }));

  // "Pode gastar": limite = soma dos orçamentos do mês; gasto do dia a dia = despesas variáveis.
  const monthExpenses = monthRows.filter((r) => r.type === "expense");
  const variableCents = monthExpenses.filter((r) => !r.is_fixed).reduce((s, r) => s + Number(r.amount_cents), 0);
  const fixedCents = monthExpenses.filter((r) => r.is_fixed).reduce((s, r) => s + Number(r.amount_cents), 0);
  const monthOcc = (await getOccurrences(rules, `${month}-01`, monthEnd)).filter((o) => o.status === "pending");
  const billsOut = monthOcc.filter((o) => o.rule.type === "expense").reduce((s, o) => s + o.amountCents, 0);
  const billsIn = monthOcc.filter((o) => o.rule.type === "income").reduce((s, o) => s + o.amountCents, 0);
  const monthInOne = {
    inCents: current.income + billsIn,
    fixedCents: fixedCents + billsOut,
    variableCents,
    leftCents: current.income + billsIn - fixedCents - billsOut - variableCents,
  };

  return {
    hasAccounts: accounts.length > 0,
    limitCents: budgets.reduce((s, b) => s + b.plannedCents, 0),
    variableCents,
    monthInOne,
    totalBalance,
    projectedBalance: totalBalance + pendingTx + pendingBills,
    current,
    previous,
    series: series.map((s, i) => ({ ...s, balance: balances[i] })),
    byCategory,
    monthEnd,
    upcoming: upcoming.filter((o) => o.status === "pending").slice(0, 6),
    overdue,
    openStatements,
    reservedCents: goals.reduce((s, g) => s + g.savedCents, 0),
    budgetAlerts: budgets.filter((b) => budgetLevel(b.usedCents, b.plannedCents) !== "ok"),
    recent: recent.rows.slice(0, 5),
  };
}

// ------------------------------------------------------------------ Relatórios
export type ReportRow = {
  date: string;
  type: "income" | "expense";
  description: string;
  amountCents: number;
  status: "paid" | "pending";
  category: string;
  source: string;
  person: string;
  scope: "Pessoal" | "Compartilhado";
  isCard: boolean;
};

/** Lançamentos do período na visão atual (o RLS garante que só vem o que a pessoa pode ver). */
export async function getReportRows(ctx: Ctx, fromMonth: string, toMonth: string): Promise<ReportRow[]> {
  const f = viewFilter(ctx);
  if (f === "empty") return [];
  const supabase = await createClient();
  const [from] = monthRange(fromMonth);
  const [, toExclusive] = monthRange(toMonth);
  let q = supabase
    .from("transactions")
    .select(
      `type, amount_cents, description, occurred_on, status, household_id,
       category:categories(name), account:accounts(name), card:credit_cards(name),
       creator:profiles!transactions_created_by_fkey(display_name),
       responsible:profiles!transactions_responsible_user_id_fkey(display_name)`,
    )
    .gte("occurred_on", from)
    .lt("occurred_on", toExclusive)
    .order("occurred_on")
    .limit(10000);
  if (f) q = q.eq(f.column, f.value);
  const { data, error } = await q.returns<
    {
      type: "income" | "expense";
      amount_cents: number;
      description: string;
      occurred_on: string;
      status: "paid" | "pending";
      household_id: string | null;
      category: { name: string } | null;
      account: { name: string } | null;
      card: { name: string } | null;
      creator: { display_name: string } | null;
      responsible: { display_name: string } | null;
    }[]
  >();
  if (error) throw new Error("Falha ao gerar o relatório");
  return (data ?? []).map((r) => ({
    date: r.occurred_on,
    type: r.type,
    description: r.description,
    amountCents: Number(r.amount_cents),
    status: r.status,
    category: r.category?.name ?? "Sem categoria",
    source: r.account?.name ?? r.card?.name ?? "—",
    person: r.responsible?.display_name ?? r.creator?.display_name ?? "—",
    scope: r.household_id ? "Compartilhado" : "Pessoal",
    isCard: !!r.card,
  }));
}

/** Soma por uma chave (para os quadros do relatório), maiores primeiro. */
export function groupTotals(rows: ReportRow[], key: (r: ReportRow) => string, type: "income" | "expense" = "expense") {
  const m = new Map<string, number>();
  for (const r of rows) if (r.type === type) m.set(key(r), (m.get(key(r)) ?? 0) + r.amountCents);
  return [...m.entries()].map(([name, cents]) => ({ name, cents })).sort((a, b) => b.cents - a.cents);
}
