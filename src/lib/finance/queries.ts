import "server-only";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { addMonthsClamped } from "@/lib/dates";
import { getMyHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { parseView, VIEW_COOKIE, type FinanceView } from "@/lib/view";
import type { Account, Category, EntryOptions, Scope, TransactionRow, TransferRow } from "./types";

/**
 * Leituras financeiras. Todas rodam como o usuário logado: o RLS decide o que volta.
 * O filtro de visão (Pessoal/Compartilhado/Consolidado) é só conveniência por cima disso.
 */

export async function getViewContext() {
  const [user, household, store] = await Promise.all([getCurrentUser(), getMyHousehold(), cookies()]);
  const chosen: FinanceView = parseView(store.get(VIEW_COOKIE)?.value);
  // Sem espaço compartilhado, "Compartilhado" ficaria sempre vazio (e esconderia o que a pessoa cria).
  const view: FinanceView = chosen === "compartilhado" && !household ? "consolidado" : chosen;
  return { user, household, view };
}

type Ctx = Awaited<ReturnType<typeof getViewContext>>;

/** Colunas/valores para filtrar pela visão; "empty" = visão sem dados possíveis. */
function viewFilter(ctx: Ctx): { column: "owner_user_id" | "household_id"; value: string } | null | "empty" {
  if (ctx.view === "pessoal") return { column: "owner_user_id", value: ctx.user.id };
  if (ctx.view === "compartilhado") return ctx.household ? { column: "household_id", value: ctx.household.id } : "empty";
  return null;
}

const scopeOf = (r: { household_id: string | null }): Scope => (r.household_id ? "shared" : "personal");

/** Primeiro dia do mês e primeiro dia do mês seguinte ("2026-11" -> ["2026-11-01", "2026-12-01"]). */
export function monthRange(month: string): [string, string] {
  const start = `${month}-01`;
  return [start, addMonthsClamped(start, 1)];
}

// ------------------------------------------------------------------ Contas
type AccountRow = {
  id: string;
  name: string;
  institution: string | null;
  type: Account["type"];
  color: string | null;
  status: "active" | "archived";
  initial_balance_cents: number;
  household_id: string | null;
  yield_annual_bp: number | null;
  yield_cdi_bp: number | null;
};

export async function getAccounts(ctx: Ctx, opts: { includeArchived?: boolean; ignoreView?: boolean } = {}) {
  const filter = opts.ignoreView ? null : viewFilter(ctx);
  if (filter === "empty") return [];
  const supabase = await createClient();
  let query = supabase
    .from("accounts")
    .select("id, name, institution, type, color, status, initial_balance_cents, household_id, yield_annual_bp, yield_cdi_bp")
    .order("status")
    .order("name");
  if (filter) query = query.eq(filter.column, filter.value);
  if (!opts.includeArchived) query = query.eq("status", "active");
  const [{ data: rows, error }, { data: balances }] = await Promise.all([
    query.returns<AccountRow[]>(),
    supabase.from("account_balances").select("account_id, balance_cents, pending_cents").returns<
      { account_id: string; balance_cents: number; pending_cents: number }[]
    >(),
  ]);
  if (error) throw new Error("Falha ao carregar contas");
  const byId = new Map((balances ?? []).map((b) => [b.account_id, b]));
  return (rows ?? []).map<Account>((r) => ({
    id: r.id,
    name: r.name,
    institution: r.institution,
    type: r.type,
    color: r.color,
    scope: scopeOf(r),
    archived: r.status === "archived",
    initialBalanceCents: Number(r.initial_balance_cents),
    balanceCents: Number(byId.get(r.id)?.balance_cents ?? r.initial_balance_cents),
    pendingCents: Number(byId.get(r.id)?.pending_cents ?? 0),
    yieldAnnualBp: r.yield_annual_bp,
    yieldCdiBp: r.yield_cdi_bp,
  }));
}

// ------------------------------------------------------------------ Categorias
export async function getCategories(): Promise<Category[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, kind, parent_id, color, owner_user_id, household_id")
    .order("name")
    .returns<
      {
        id: string;
        name: string;
        kind: Category["kind"];
        parent_id: string | null;
        color: string | null;
        owner_user_id: string | null;
        household_id: string | null;
      }[]
    >();
  if (error) throw new Error("Falha ao carregar categorias");
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    parentId: c.parent_id,
    color: c.color,
    scope: c.household_id ? "shared" : c.owner_user_id ? "personal" : null,
  }));
}

export async function getEntryOptions(): Promise<EntryOptions> {
  const ctx = await getViewContext();
  const [accounts, categories] = await Promise.all([getAccounts(ctx, { ignoreView: true }), getCategories()]);
  return {
    userId: ctx.user.id,
    householdId: ctx.household?.id ?? null,
    members: (ctx.household?.members ?? []).map(({ userId, displayName, avatarColor }) => ({ userId, displayName, avatarColor })),
    accounts: accounts.map(({ id, name, scope }) => ({ id, name, scope })),
    categories,
  };
}

// ------------------------------------------------------------------ Lançamentos
export type TransactionFilters = {
  month: string;
  q?: string;
  type?: "income" | "expense";
  status?: "paid" | "pending";
  accountId?: string;
  categoryId?: string;
  fixed?: "fixed" | "variable";
  sort?: "date_desc" | "date_asc" | "amount_desc" | "amount_asc";
  page?: number;
};

export const PAGE_SIZE = 50;

type TxDbRow = {
  id: string;
  type: "income" | "expense";
  amount_cents: number;
  description: string;
  occurred_on: string;
  paid_on: string | null;
  status: "paid" | "pending";
  is_fixed: boolean;
  notes: string | null;
  household_id: string | null;
  account_id: string | null;
  credit_card_id: string | null;
  category_id: string | null;
  responsible_user_id: string | null;
  account: { name: string } | null;
  card: { name: string } | null;
  category: { name: string; color: string | null } | null;
  creator: { display_name: string } | null;
  responsible: { display_name: string } | null;
  expense_splits: { user_id: string; amount_cents: number }[];
  installment_number: number | null;
  installment_purchase_id: string | null;
  purchase: { installments_count: number } | null;
};

const TX_SELECT = `id, type, amount_cents, description, occurred_on, paid_on, status, is_fixed, notes,
  household_id, account_id, credit_card_id, category_id, responsible_user_id,
  account:accounts(name), card:credit_cards(name), category:categories(name, color),
  creator:profiles!transactions_created_by_fkey(display_name),
  responsible:profiles!transactions_responsible_user_id_fkey(display_name),
  expense_splits(user_id, amount_cents), installment_number, installment_purchase_id,
  purchase:installment_purchases(installments_count)`;

function mapTx(r: TxDbRow): TransactionRow {
  return {
    id: r.id,
    type: r.type,
    amountCents: Number(r.amount_cents),
    description: r.description,
    occurredOn: r.occurred_on,
    paidOn: r.paid_on,
    status: r.status,
    isFixed: r.is_fixed,
    notes: r.notes,
    scope: scopeOf(r),
    accountId: r.account_id,
    accountName: r.account?.name ?? null,
    creditCardName: r.card?.name ?? null,
    categoryId: r.category_id,
    categoryName: r.category?.name ?? null,
    categoryColor: r.category?.color ?? null,
    createdByName: r.creator?.display_name ?? "—",
    responsibleUserId: r.responsible_user_id,
    responsibleName: r.responsible?.display_name ?? null,
    splits: (r.expense_splits ?? []).map((s) => ({ userId: s.user_id, amountCents: Number(s.amount_cents) })),
    installment: r.installment_number && r.purchase ? `${r.installment_number}/${r.purchase.installments_count}` : null,
    purchaseId: r.installment_purchase_id,
    // Compras no cartão são geridas na tela do cartão (compra inteira, com todas as parcelas).
    editable: r.credit_card_id === null,
  };
}

/** Escapa curingas do LIKE para a busca não virar padrão. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function getTransactions(ctx: Ctx, f: TransactionFilters) {
  const filter = viewFilter(ctx);
  if (filter === "empty") return { rows: [] as TransactionRow[], total: 0 };
  const supabase = await createClient();
  const [start, end] = monthRange(f.month);
  const sort = f.sort ?? "date_desc";
  const page = Math.max(1, f.page ?? 1);

  let query = supabase
    .from("transactions")
    .select(TX_SELECT, { count: "exact" })
    .gte("occurred_on", start)
    .lt("occurred_on", end);
  if (filter) query = query.eq(filter.column, filter.value);
  if (f.q) query = query.ilike("description", `%${likeEscape(f.q)}%`);
  if (f.type) query = query.eq("type", f.type);
  if (f.status) query = query.eq("status", f.status);
  if (f.accountId) query = query.eq("account_id", f.accountId);
  if (f.categoryId) query = query.eq("category_id", f.categoryId);
  if (f.fixed) query = query.eq("is_fixed", f.fixed === "fixed");
  const [column, dir] = sort.startsWith("amount") ? ["amount_cents", sort] : ["occurred_on", sort];
  query = query
    .order(column, { ascending: dir.endsWith("asc") })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const { data, error, count } = await query.returns<TxDbRow[]>();
  if (error) throw new Error("Falha ao carregar lançamentos");
  return { rows: (data ?? []).map(mapTx), total: count ?? 0 };
}

/** Totais do mês por competência (data do lançamento), na visão atual. */
export async function getMonthSummary(ctx: Ctx, month: string) {
  const filter = viewFilter(ctx);
  const empty = { incomeCents: 0, expenseCents: 0, resultCents: 0 };
  if (filter === "empty") return empty;
  const supabase = await createClient();
  const [start, end] = monthRange(month);
  let query = supabase.from("transactions").select("type, amount_cents").gte("occurred_on", start).lt("occurred_on", end);
  if (filter) query = query.eq(filter.column, filter.value);
  // shortcut: soma no app (inteiros); se o volume crescer muito, trocar por função SQL de agregação.
  const { data, error } = await query.returns<{ type: "income" | "expense"; amount_cents: number }[]>();
  if (error) throw new Error("Falha ao calcular o resumo");
  let incomeCents = 0;
  let expenseCents = 0;
  for (const r of data ?? []) {
    if (r.type === "income") incomeCents += Number(r.amount_cents);
    else expenseCents += Number(r.amount_cents);
  }
  return { incomeCents, expenseCents, resultCents: incomeCents - expenseCents };
}

// ------------------------------------------------------------------ Transferências
type TransferDbRow = {
  id: string;
  from_account_id: string;
  to_account_id: string;
  amount_cents: number;
  occurred_on: string;
  description: string | null;
  from: { name: string } | null;
  to: { name: string } | null;
  creator: { display_name: string } | null;
};

const TRANSFER_SELECT = `id, from_account_id, to_account_id, amount_cents, occurred_on, description,
  from:accounts!transfers_from_account_id_fkey(name), to:accounts!transfers_to_account_id_fkey(name),
  creator:profiles!transfers_created_by_fkey(display_name)`;

const mapTransfer = (r: TransferDbRow): TransferRow => ({
  id: r.id,
  fromAccountId: r.from_account_id,
  toAccountId: r.to_account_id,
  // Conta pessoal da outra pessoa: o RLS esconde o nome.
  fromName: r.from?.name ?? null,
  toName: r.to?.name ?? null,
  amountCents: Number(r.amount_cents),
  occurredOn: r.occurred_on,
  description: r.description,
  createdByName: r.creator?.display_name ?? "—",
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getTransfers(month: string, accountId?: string) {
  // O id entra num filtro .or(): só aceita UUID para não permitir injeção de filtro.
  if (accountId && !UUID_RE.test(accountId)) throw new Error("Conta inválida");
  const supabase = await createClient();
  const [start, end] = monthRange(month);
  let query = supabase
    .from("transfers")
    .select(TRANSFER_SELECT)
    .gte("occurred_on", start)
    .lt("occurred_on", end)
    .order("occurred_on", { ascending: false });
  if (accountId) query = query.or(`from_account_id.eq.${accountId},to_account_id.eq.${accountId}`);
  const { data, error } = await query.returns<TransferDbRow[]>();
  if (error) throw new Error("Falha ao carregar transferências");
  return (data ?? []).map(mapTransfer);
}

// ------------------------------------------------------------------ Extrato
export async function getAccountStatement(accountId: string, month: string) {
  const supabase = await createClient();
  const [start, end] = monthRange(month);
  const [{ data: txs, error }, transfers] = await Promise.all([
    supabase
      .from("transactions")
      .select(TX_SELECT)
      .eq("account_id", accountId)
      .gte("occurred_on", start)
      .lt("occurred_on", end)
      .order("occurred_on", { ascending: false })
      .returns<TxDbRow[]>(),
    getTransfers(month, accountId),
  ]);
  if (error) throw new Error("Falha ao carregar o extrato");
  return { transactions: (txs ?? []).map(mapTx), transfers };
}

// ------------------------------------------------------------------ Histórico
export type HistoryEntry = {
  id: number;
  action: "INSERT" | "UPDATE" | "DELETE";
  actorName: string;
  at: string;
  changed: string[];
};

const IGNORED_FIELDS = new Set(["updated_at", "created_at", "idempotency_key", "id", "created_by"]);

export async function getHistory(table: "transactions" | "transfers" | "accounts", recordId: string): Promise<HistoryEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, action, actor_id, created_at, old_data, new_data")
    .eq("table_name", table)
    .eq("record_id", recordId)
    .order("id", { ascending: false })
    .limit(50)
    .returns<
      {
        id: number;
        action: HistoryEntry["action"];
        actor_id: string | null;
        created_at: string;
        old_data: Record<string, unknown> | null;
        new_data: Record<string, unknown> | null;
      }[]
    >();
  if (error) throw new Error("Falha ao carregar o histórico");
  const actorIds = [...new Set((data ?? []).map((r) => r.actor_id).filter((x): x is string => !!x))];
  const { data: profiles } = actorIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", actorIds).returns<{ id: string; display_name: string }[]>()
    : { data: [] };
  const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
  return (data ?? []).map((r) => ({
    id: r.id,
    action: r.action,
    actorName: (r.actor_id && names.get(r.actor_id)) || "Sistema",
    at: r.created_at,
    changed:
      r.action === "UPDATE" && r.old_data && r.new_data
        ? Object.keys(r.new_data).filter(
            (k) => !IGNORED_FIELDS.has(k) && JSON.stringify(r.old_data![k]) !== JSON.stringify(r.new_data![k]),
          )
        : [],
  }));
}

export async function getStatementTransactions(statementId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select(TX_SELECT)
    .eq("statement_id", statementId)
    .order("occurred_on", { ascending: false })
    .returns<TxDbRow[]>();
  if (error) throw new Error("Falha ao carregar a fatura");
  return (data ?? []).map(mapTx);
}
