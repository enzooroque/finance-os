import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let alice: string;
let bob: string;
let card: string;
let account: string;

const q = async <T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) =>
  t.as(user, async () => (await t.db.query<T>(sql, params)).rows);

const buy = (total: number, n: number, date: string, key = randomUUID()) =>
  q<{ id: string }>(alice, "select public.create_card_purchase($1, 'Compra', $2, $3, $4, null, $5) as id", [card, total, n, date, key]).then(
    (r) => r[0].id,
  );

const parcels = (purchase: string) =>
  q<{ amount_cents: number; reference_month: string; due_date: string; occurred_on: string }>(
    alice,
    `select t.amount_cents, s.reference_month::text, s.due_date::text, t.occurred_on::text
     from public.transactions t join public.credit_card_statements s on s.id = t.statement_id
     where t.installment_purchase_id = $1 order by t.installment_number`,
    [purchase],
  );

const summary = async (statement: string) =>
  (await q<{ total_cents: number; paid_cents: number }>(alice, "select total_cents, paid_cents from public.statement_summaries where id = $1", [statement]))[0];

beforeAll(async () => {
  t = await createTestDb();
  alice = await t.createUser("alice@example.com");
  bob = await t.createUser("bob@example.com");
  card = (
    await q<{ id: string }>(
      alice,
      "insert into public.credit_cards (owner_user_id, name, limit_cents, closing_day, due_day) values ($1, 'Visa', 500000, 5, 12) returning id",
      [alice],
    )
  )[0].id;
  account = (
    await q<{ id: string }>(
      alice,
      "insert into public.accounts (owner_user_id, name, type, initial_balance_cents) values ($1, 'Conta', 'checking', 100000) returning id",
      [alice],
    )
  )[0].id;
}, 60_000);

describe("faturas e parcelas", () => {
  it("compra antes do fechamento cai na fatura do mês; no dia do fechamento, na seguinte", async () => {
    const a = await parcels(await buy(1000, 1, "2026-11-04"));
    const b = await parcels(await buy(1000, 1, "2026-11-05"));
    expect(a[0]).toMatchObject({ reference_month: "2026-11-01", due_date: "2026-11-12" });
    expect(b[0]).toMatchObject({ reference_month: "2026-12-01", due_date: "2026-12-12" });
  });

  it("R$ 1.200 em 12x: 12 parcelas de R$ 100 em 12 faturas seguidas, virando o ano", async () => {
    const p = await parcels(await buy(120000, 12, "2026-11-20"));
    expect(p.map((x) => Number(x.amount_cents))).toEqual(Array(12).fill(10000));
    expect(p[0].reference_month).toBe("2026-12-01");
    expect(p[11].reference_month).toBe("2027-11-01");
    expect(p[1].occurred_on).toBe("2026-12-20");
  });

  it("centavos que sobram vão para as primeiras parcelas e a soma fecha", async () => {
    const p = await parcels(await buy(1000, 3, "2026-11-01"));
    expect(p.map((x) => Number(x.amount_cents))).toEqual([334, 333, 333]);
  });

  it("fim de mês: compra em 31/01 parcela em 28/02 (competência)", async () => {
    const p = await parcels(await buy(200, 2, "2027-01-31"));
    expect(p[1].occurred_on).toBe("2027-02-28");
  });

  it("vencimento antes do fechamento vence no mês seguinte", async () => {
    const other = (
      await q<{ id: string }>(
        alice,
        "insert into public.credit_cards (owner_user_id, name, limit_cents, closing_day, due_day) values ($1, 'Elo', 1000, 25, 3) returning id",
        [alice],
      )
    )[0].id;
    const id = (await q<{ id: string }>(alice, "select public.ensure_statement($1, '2027-02-01') as id", [other]))[0].id;
    const st = await q<{ closing_date: string; due_date: string }>(
      alice,
      "select closing_date::text, due_date::text from public.credit_card_statements where id = $1",
      [id],
    );
    expect(st[0]).toEqual({ closing_date: "2027-02-25", due_date: "2027-03-03" });
  });

  it("idempotência: a mesma compra enviada duas vezes cria uma só", async () => {
    const key = randomUUID();
    const a = await buy(5000, 2, "2026-11-10", key);
    const b = await buy(5000, 2, "2026-11-10", key);
    expect(a).toBe(b);
    expect(await parcels(a)).toHaveLength(2);
  });

  it("compra no cartão não mexe no saldo da conta", async () => {
    const r = await q<{ balance_cents: number }>(alice, "select balance_cents from public.account_balances where account_id = $1", [account]);
    expect(Number(r[0].balance_cents)).toBe(100000);
  });
});

describe("pagamentos de fatura", () => {
  let statement: string;

  beforeAll(async () => {
    // Cartão novo: a fatura deste teste não pode ter parcelas dos testes anteriores.
    card = (
      await q<{ id: string }>(
        alice,
        "insert into public.credit_cards (owner_user_id, name, limit_cents, closing_day, due_day) values ($1, 'Master', 500000, 5, 12) returning id",
        [alice],
      )
    )[0].id;
    const p = await buy(30000, 1, "2027-03-01");
    statement = (await q<{ statement_id: string }>(alice, "select statement_id from public.transactions where installment_purchase_id = $1", [p]))[0]
      .statement_id;
  });

  const pay = (amount: number, key = randomUUID()) =>
    q(alice, "select public.pay_statement($1, $2, $3, '2027-03-10', $4)", [statement, account, amount, key]);

  it("pagamento parcial, depois o resto; o saldo da conta cai só pelo pagamento", async () => {
    await pay(10000);
    expect(await summary(statement)).toEqual({ total_cents: 30000, paid_cents: 10000 });
    await pay(20000);
    expect(await summary(statement)).toEqual({ total_cents: 30000, paid_cents: 30000 });
    const r = await q<{ balance_cents: number }>(alice, "select balance_cents from public.account_balances where account_id = $1", [account]);
    expect(Number(r[0].balance_cents)).toBe(70000);
  });

  it("não aceita pagar mais do que falta (nem duplicar pelo mesmo envio)", async () => {
    await expect(pay(1)).rejects.toThrow(/no máximo o que falta/);
  });

  it("compra em fatura com pagamento não pode ser excluída", async () => {
    const p = (await q<{ id: string }>(alice, "select installment_purchase_id as id from public.transactions where statement_id = $1", [statement]))[0].id;
    await expect(q(alice, "select public.delete_card_purchase($1)", [p])).rejects.toThrow(/já tem pagamento/);
  });

  it("compra sem pagamento é excluída com todas as parcelas", async () => {
    const p = await buy(9000, 3, "2028-01-10");
    await q(alice, "select public.delete_card_purchase($1)", [p]);
    expect(await parcels(p)).toHaveLength(0);
  });
});

describe("isolamento", () => {
  it("outra pessoa não vê, não compra e não paga no cartão pessoal", async () => {
    expect(await q(bob, "select 1 from public.credit_cards where id = $1", [card])).toHaveLength(0);
    expect(await q(bob, "select 1 from public.statement_summaries where credit_card_id = $1", [card])).toHaveLength(0);
    await expect(
      q(bob, "select public.create_card_purchase($1, 'x', 100, 1, '2026-11-10', null, $2)", [card, randomUUID()]),
    ).rejects.toThrow(/Cartão não encontrado/);
  });
});
