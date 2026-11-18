import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let alice: string;
let bob: string;
let rule: string;
let account: string;
let goal: string;

const q = async <T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) =>
  t.as(user, async () => (await t.db.query<T>(sql, params)).rows);
const one = async <T>(user: string, sql: string, params: unknown[] = []) => (await q<T>(user, sql, params))[0];

beforeAll(async () => {
  t = await createTestDb();
  alice = await t.createUser("alice@example.com");
  bob = await t.createUser("bob@example.com");
  account = (await one<{ id: string }>(alice, "insert into public.accounts (owner_user_id, name, type, initial_balance_cents) values ($1, 'C', 'checking', 100000) returning id", [alice])).id;
  rule = (
    await one<{ id: string }>(
      alice,
      `insert into public.recurring_rules (owner_user_id, type, description, amount_cents, frequency, start_on, next_due_on, account_id)
       values ($1, 'expense', 'Aluguel', 150000, 'monthly', '2026-11-10', '2026-11-10', $2) returning id`,
      [alice, account],
    )
  ).id;
  goal = (await one<{ id: string }>(alice, "insert into public.financial_goals (owner_user_id, name, target_cents) values ($1, 'Viagem', 1000000) returning id", [alice])).id;
}, 60_000);

describe("contas a pagar", () => {
  it("pagar cria o lançamento (competência = vencimento) e baixa o saldo", async () => {
    const tx = (await one<{ id: string }>(alice, "select public.pay_occurrence($1, '2026-11-10', $2, 150000, '2026-11-12') as id", [rule, account])).id;
    const row = await one<{ occurred_on: string; paid_on: string; is_fixed: boolean }>(
      alice,
      "select occurred_on::text, paid_on::text, is_fixed from public.transactions where id = $1",
      [tx],
    );
    expect(row).toEqual({ occurred_on: "2026-11-10", paid_on: "2026-11-12", is_fixed: true });
    const b = await one<{ balance_cents: number }>(alice, "select balance_cents from public.account_balances where account_id = $1", [account]);
    expect(Number(b.balance_cents)).toBe(-50000);
  });

  it("não paga a mesma ocorrência duas vezes", async () => {
    await expect(q(alice, "select public.pay_occurrence($1, '2026-11-10', $2, 150000, null)", [rule, account])).rejects.toThrow(/já foi paga/);
  });

  it("excluir o lançamento devolve a ocorrência para 'a pagar'", async () => {
    await q(alice, "delete from public.transactions where description = 'Aluguel'");
    expect(await q(alice, "select 1 from public.recurring_occurrences where rule_id = $1", [rule])).toHaveLength(0);
  });

  it("pular e mudar o valor de uma ocorrência sem mexer na série", async () => {
    await q(alice, "select public.skip_occurrence($1, '2026-12-10')", [rule]);
    await q(alice, "select public.set_occurrence_amount($1, '2027-01-10', 160000)", [rule]);
    const rows = await q<{ due_on: string; status: string; amount_cents: number }>(
      alice,
      "select due_on::text, status, amount_cents from public.recurring_occurrences where rule_id = $1 order by due_on",
      [rule],
    );
    expect(rows.map((r) => [r.due_on, r.status, Number(r.amount_cents)])).toEqual([
      ["2026-12-10", "skipped", 150000],
      ["2027-01-10", "pending", 160000],
    ]);
    const r = await one<{ amount_cents: number }>(alice, "select amount_cents from public.recurring_rules where id = $1", [rule]);
    expect(Number(r.amount_cents)).toBe(150000);
  });

  it("outra pessoa não vê nem paga a conta", async () => {
    expect(await q(bob, "select 1 from public.recurring_rules where id = $1", [rule])).toHaveLength(0);
    await expect(q(bob, "select public.pay_occurrence($1, '2027-02-10', $2, 1, null)", [rule, account])).rejects.toThrow(/não encontrada/);
  });
});

describe("metas", () => {
  const move = (kind: string, amount: number, key = randomUUID()) =>
    q(alice, "select public.add_goal_movement($1, $2, $3, '2026-11-15', null, $4)", [goal, kind, amount, key]);
  const saved = async () => Number((await one<{ saved_cents: number }>(alice, "select saved_cents from public.goal_progress where goal_id = $1", [goal])).saved_cents);

  it("aporte e retirada atualizam o guardado; idempotente", async () => {
    const key = randomUUID();
    await move("deposit", 50000, key);
    await move("deposit", 50000, key);
    await move("withdrawal", 20000);
    expect(await saved()).toBe(30000);
  });

  it("retirada maior que o guardado é recusada", async () => {
    await expect(move("withdrawal", 30001)).rejects.toThrow(/maior que o valor guardado/);
  });

  it("aporte em meta não mexe no saldo da conta", async () => {
    const b = await one<{ balance_cents: number }>(alice, "select balance_cents from public.account_balances where account_id = $1", [account]);
    expect(Number(b.balance_cents)).toBe(100000);
  });

  it("outra pessoa não vê a meta", async () => {
    expect(await q(bob, "select 1 from public.goal_progress where goal_id = $1", [goal])).toHaveLength(0);
  });
});
