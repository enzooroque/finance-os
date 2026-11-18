import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getViewContext } from "./queries";
import type { CardBrand } from "./statement";
import type { Scope } from "./types";

export type Card = {
  id: string;
  name: string;
  institution: string | null;
  brand: CardBrand;
  lastFour: string | null;
  limitCents: number;
  closingDay: number;
  dueDay: number;
  color: string | null;
  scope: Scope;
  archived: boolean;
  /** Em aberto no cartão (gastos − pagamentos), em todas as faturas. */
  usedCents: number;
};

export type StatementSummary = {
  id: string;
  cardId: string;
  referenceMonth: string;
  closingDate: string;
  dueDate: string;
  totalCents: number;
  paidCents: number;
};

type Ctx = Awaited<ReturnType<typeof getViewContext>>;

type SummaryRow = {
  id: string;
  credit_card_id: string;
  reference_month: string;
  closing_date: string;
  due_date: string;
  total_cents: number;
  paid_cents: number;
};

const mapSummary = (r: SummaryRow): StatementSummary => ({
  id: r.id,
  cardId: r.credit_card_id,
  referenceMonth: r.reference_month,
  closingDate: r.closing_date,
  dueDate: r.due_date,
  totalCents: Number(r.total_cents),
  paidCents: Number(r.paid_cents),
});

export async function getCards(ctx: Ctx, opts: { ignoreView?: boolean } = {}): Promise<Card[]> {
  if (!opts.ignoreView && ctx.view === "compartilhado" && !ctx.household) return [];
  const supabase = await createClient();
  let query = supabase
    .from("credit_cards")
    .select("id, name, institution, brand, last_four, limit_cents, closing_day, due_day, color, status, household_id")
    .order("status")
    .order("name");
  if (!opts.ignoreView && ctx.view === "pessoal") query = query.eq("owner_user_id", ctx.user.id);
  if (!opts.ignoreView && ctx.view === "compartilhado") query = query.eq("household_id", ctx.household!.id);
  const [{ data, error }, { data: sums }] = await Promise.all([
    query.returns<
      {
        id: string;
        name: string;
        institution: string | null;
        brand: CardBrand;
        last_four: string | null;
        limit_cents: number;
        closing_day: number;
        due_day: number;
        color: string | null;
        status: "active" | "archived";
        household_id: string | null;
      }[]
    >(),
    supabase.from("statement_summaries").select("credit_card_id, total_cents, paid_cents").returns<SummaryRow[]>(),
  ]);
  if (error) throw new Error("Falha ao carregar cartões");
  const used = new Map<string, number>();
  for (const s of sums ?? []) used.set(s.credit_card_id, (used.get(s.credit_card_id) ?? 0) + Number(s.total_cents) - Number(s.paid_cents));
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    institution: c.institution,
    brand: c.brand,
    lastFour: c.last_four,
    limitCents: Number(c.limit_cents),
    closingDay: c.closing_day,
    dueDay: c.due_day,
    color: c.color,
    scope: c.household_id ? "shared" : "personal",
    archived: c.status === "archived",
    usedCents: used.get(c.id) ?? 0,
  }));
}

export async function getStatements(cardId: string): Promise<StatementSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("statement_summaries")
    .select("id, credit_card_id, reference_month, closing_date, due_date, total_cents, paid_cents")
    .eq("credit_card_id", cardId)
    .order("reference_month")
    .returns<SummaryRow[]>();
  if (error) throw new Error("Falha ao carregar faturas");
  return (data ?? []).map(mapSummary);
}

export type StatementPayment = { id: string; amountCents: number; paidOn: string; accountName: string | null };

export async function getStatementPayments(statementId: string): Promise<StatementPayment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("statement_payments")
    .select("id, amount_cents, paid_on, account:accounts(name)")
    .eq("statement_id", statementId)
    .order("paid_on")
    .returns<{ id: string; amount_cents: number; paid_on: string; account: { name: string } | null }[]>();
  return (data ?? []).map((p) => ({ id: p.id, amountCents: Number(p.amount_cents), paidOn: p.paid_on, accountName: p.account?.name ?? null }));
}
