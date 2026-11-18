import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./db";

type Db = Awaited<ReturnType<typeof createTestDb>>;

let t: Db;
let alice: string;
let bob: string;
let carol: string;
let household: string;
let alicePersonal: string;
let shared: string;
let bobPersonal: string;

const q = async <T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) =>
  t.as(user, async () => (await t.db.query<T>(sql, params)).rows);

async function account(user: string, scope: "personal" | "shared", name: string, initial = 0) {
  const rows = await q<{ id: string }>(
    user,
    `insert into public.accounts (owner_user_id, household_id, name, type, initial_balance_cents)
     values ($1, $2, $3, 'checking', $4) returning id`,
    [scope === "personal" ? user : null, scope === "shared" ? household : null, name, initial],
  );
  return rows[0].id;
}

type Tx = {
  id?: string | null;
  scope?: "personal" | "shared";
  type?: "income" | "expense";
  amount: number;
  account: string;
  status?: "paid" | "pending";
  splits?: { user_id: string; amount_cents: number }[] | null;
  key?: string | null;
  date?: string;
};

async function save(user: string, tx: Tx) {
  const rows = await q<{ id: string }>(
    user,
    `select public.save_transaction($1, $2, $3, $4, 'Teste', null, $5, $6, $7, null, null, false, null, $8, $9) as id`,
    [
      tx.id ?? null,
      tx.scope ?? "personal",
      tx.type ?? "expense",
      tx.amount,
      tx.date ?? "2026-11-10",
      tx.account,
      tx.status ?? "paid",
      tx.splits ? JSON.stringify(tx.splits) : null,
      tx.key ?? null,
    ],
  );
  return rows[0].id;
}

const balance = async (user: string, accountId: string) =>
  (await q<{ balance_cents: number; pending_cents: number }>(
    user,
    "select balance_cents, pending_cents from public.account_balances where account_id = $1",
    [accountId],
  ))[0];

beforeAll(async () => {
  t = await createTestDb();
  alice = await t.createUser("alice@example.com");
  bob = await t.createUser("bob@example.com");
  carol = await t.createUser("carol@example.com");
  household = (await q<{ id: string }>(alice, "select public.create_household('Casa') as id"))[0].id;
  const token = (await q<{ t: string }>(alice, "select public.create_household_invite() as t"))[0].t;
  await q(bob, "select public.accept_household_invite($1)", [token]);
  alicePersonal = await account(alice, "personal", "Alice", 100000);
  shared = await account(alice, "shared", "Conjunta", 0);
  bobPersonal = await account(bob, "personal", "Bob", 50000);
}, 60_000);

describe("categorias", () => {
  it("categorias padrão aparecem para todos e ninguém consegue editá-las", async () => {
    const rows = await q<{ id: string }>(carol, "select id from public.categories where owner_user_id is null and household_id is null");
    expect(rows.length).toBeGreaterThanOrEqual(15);
    await q(alice, "update public.categories set name = 'X' where id = $1", [rows[0].id]);
    const after = await q<{ name: string }>(alice, "select name from public.categories where id = $1", [rows[0].id]);
    expect(after[0].name).not.toBe("X");
  });

  it("subcategoria: mesmo tipo, um nível só, nome único", async () => {
    const parent = (await q<{ id: string }>(alice, "select id from public.categories where name = 'Mercado' and owner_user_id is null"))[0].id;
    const income = (await q<{ id: string }>(alice, "select id from public.categories where name = 'Salário' and owner_user_id is null"))[0].id;
    const ins = (name: string, kind: string, p: string) =>
      q<{ id: string }>(
        alice,
        "insert into public.categories (owner_user_id, kind, name, parent_id) values ($1, $2, $3, $4) returning id",
        [alice, kind, name, p],
      );
    const sub = (await ins("Feira", "expense", parent))[0].id;
    await expect(ins("feira", "expense", parent)).rejects.toThrow(/duplicate key/);
    await expect(ins("Bônus", "expense", income)).rejects.toThrow(/mesmo tipo/);
    await expect(ins("Neta", "expense", sub)).rejects.toThrow(/categoria principal/);
    expect(await q(bob, "select 1 from public.categories where id = $1", [sub])).toHaveLength(0);
  });
});

describe("save_transaction e saldos", () => {
  it("saldo = inicial + receitas pagas − despesas pagas; pendentes ficam à parte", async () => {
    await save(alice, { type: "income", amount: 50000, account: alicePersonal });
    await save(alice, { type: "expense", amount: 12345, account: alicePersonal });
    await save(alice, { type: "expense", amount: 9999, account: alicePersonal, status: "pending" });
    expect(await balance(alice, alicePersonal)).toEqual({ balance_cents: 137655, pending_cents: -9999 });
  });

  it("idempotência: mesma chave devolve o mesmo lançamento e não duplica saldo", async () => {
    const key = randomUUID();
    const before = (await balance(alice, alicePersonal)).balance_cents;
    const a = await save(alice, { amount: 1000, account: alicePersonal, key });
    const b = await save(alice, { amount: 1000, account: alicePersonal, key });
    expect(a).toBe(b);
    expect((await balance(alice, alicePersonal)).balance_cents).toBe(before - 1000);
  });

  it("editar recalcula o saldo e mantém quem criou", async () => {
    const id = await save(alice, { amount: 2000, account: alicePersonal });
    const before = (await balance(alice, alicePersonal)).balance_cents;
    await save(alice, { id, amount: 500, account: alicePersonal });
    expect((await balance(alice, alicePersonal)).balance_cents).toBe(before + 1500);
    const row = await q<{ created_by: string }>(alice, "select created_by from public.transactions where id = $1", [id]);
    expect(row[0].created_by).toBe(alice);
  });

  it("outra pessoa não edita nem vê o saldo da conta pessoal", async () => {
    const id = await save(alice, { amount: 700, account: alicePersonal });
    await expect(save(bob, { id, amount: 1, account: alicePersonal })).rejects.toThrow();
    expect(await q(bob, "select 1 from public.account_balances where account_id = $1", [alicePersonal])).toHaveLength(0);
  });

  it("lançamento pessoal não pode usar conta compartilhada (e vice-versa)", async () => {
    await expect(save(alice, { scope: "personal", amount: 100, account: shared })).rejects.toThrow(/titularidade/);
    await expect(save(alice, { scope: "shared", amount: 100, account: alicePersonal })).rejects.toThrow(/titularidade/);
  });
});

describe("divisão de despesas compartilhadas", () => {
  it("grava a divisão quando a soma bate e os dois membros veem", async () => {
    const id = await save(bob, {
      scope: "shared",
      amount: 10001,
      account: shared,
      splits: [
        { user_id: alice, amount_cents: 5001 },
        { user_id: bob, amount_cents: 5000 },
      ],
    });
    const rows = await q<{ amount_cents: number }>(alice, "select amount_cents from public.expense_splits where transaction_id = $1", [id]);
    expect(rows.map((r) => Number(r.amount_cents)).sort()).toEqual([5000, 5001]);
  });

  it("recusa soma diferente, pessoa de fora, duplicada ou divisão em lançamento pessoal", async () => {
    const base = { scope: "shared" as const, amount: 1000, account: shared };
    await expect(save(alice, { ...base, splits: [{ user_id: alice, amount_cents: 999 }] })).rejects.toThrow(/soma/);
    await expect(
      save(alice, { ...base, splits: [{ user_id: alice, amount_cents: 500 }, { user_id: carol, amount_cents: 500 }] }),
    ).rejects.toThrow(/membros/);
    await expect(
      save(alice, { ...base, splits: [{ user_id: alice, amount_cents: 500 }, { user_id: alice, amount_cents: 500 }] }),
    ).rejects.toThrow(/só uma vez/);
    await expect(
      save(alice, { amount: 1000, account: alicePersonal, splits: [{ user_id: alice, amount_cents: 1000 }] }),
    ).rejects.toThrow(/compartilhadas/);
  });

  it("falha na divisão não deixa lançamento pela metade (atômico)", async () => {
    const before = await q(alice, "select 1 from public.transactions where account_id = $1", [shared]);
    await expect(
      save(alice, { scope: "shared", amount: 1000, account: shared, splits: [{ user_id: alice, amount_cents: 1 }] }),
    ).rejects.toThrow();
    const after = await q(alice, "select 1 from public.transactions where account_id = $1", [shared]);
    expect(after.length).toBe(before.length);
  });
});

describe("transferências", () => {
  it("move saldo entre contas sem contar como receita/despesa", async () => {
    const aBefore = (await balance(alice, alicePersonal)).balance_cents;
    const sBefore = (await balance(alice, shared)).balance_cents;
    await q(
      alice,
      "insert into public.transfers (from_account_id, to_account_id, amount_cents, occurred_on) values ($1, $2, 30000, '2026-11-11')",
      [alicePersonal, shared],
    );
    expect((await balance(alice, alicePersonal)).balance_cents).toBe(aBefore - 30000);
    expect((await balance(alice, shared)).balance_cents).toBe(sBefore + 30000);
    // Bob vê o mesmo saldo da conjunta que Alice.
    expect((await balance(bob, shared)).balance_cents).toBe(sBefore + 30000);
    const tx = await q(alice, "select 1 from public.transactions where description = 'Transferência'");
    expect(tx).toHaveLength(0);
  });

  it("Bob vê a transferência para a conjunta mas não pode apagá-la (não acessa a conta da Alice)", async () => {
    const rows = await q<{ id: string }>(bob, "select id from public.transfers where to_account_id = $1", [shared]);
    expect(rows.length).toBeGreaterThan(0);
    await q(bob, "delete from public.transfers where id = $1", [rows[0].id]);
    expect(await q(alice, "select 1 from public.transfers where id = $1", [rows[0].id])).toHaveLength(1);
  });

  it("ninguém transfere a partir da conta de outra pessoa", async () => {
    await expect(
      q(
        bob,
        "insert into public.transfers (from_account_id, to_account_id, amount_cents, occurred_on) values ($1, $2, 100, '2026-11-11')",
        [alicePersonal, bobPersonal],
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("conta com lançamentos não pode ser excluída (precisa arquivar)", async () => {
    await expect(q(alice, "delete from public.accounts where id = $1", [alicePersonal])).rejects.toThrow(/foreign key/);
  });
});

describe("histórico", () => {
  it("registra criação e edição com o autor", async () => {
    const id = await save(alice, { amount: 4200, account: alicePersonal });
    await save(alice, { id, amount: 4300, account: alicePersonal });
    const rows = await q<{ action: string; actor_id: string }>(
      alice,
      "select action, actor_id from public.audit_logs where table_name = 'transactions' and record_id = $1 order by id",
      [id],
    );
    expect(rows.map((r) => r.action)).toEqual(["INSERT", "UPDATE"]);
    expect(rows.every((r) => r.actor_id === alice)).toBe(true);
  });
});
