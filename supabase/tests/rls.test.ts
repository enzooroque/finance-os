import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./db";

type Db = Awaited<ReturnType<typeof createTestDb>>;

let t: Db;
let alice: string;
let bob: string;
let carol: string;

async function newAccount(userId: string, scope: { owner?: string; household?: string }, name: string) {
  return t.as(userId, async () => {
    const { rows } = await t.db.query<{ id: string }>(
      `insert into public.accounts (owner_user_id, household_id, name, type, initial_balance_cents)
       values ($1, $2, $3, 'checking', 100000) returning id`,
      [scope.owner ?? null, scope.household ?? null, name],
    );
    return rows[0].id;
  });
}

const count = async (userId: string | null, sql: string, params: unknown[] = []) =>
  t.as(userId, async () => (await t.db.query(sql, params)).rows.length);

beforeAll(async () => {
  t = await createTestDb();
  alice = await t.createUser("alice@example.com");
  bob = await t.createUser("bob@example.com");
  carol = await t.createUser("carol@example.com");
}, 60_000);

describe("estrutura do banco", () => {
  it("RLS está ligado em todas as tabelas do schema public", async () => {
    const { rows } = await t.db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("todo valor em dinheiro (*_cents) é bigint (centavos inteiros, nunca float)", async () => {
    const { rows } = await t.db.query<{ col: string; data_type: string }>(
      `select table_name || '.' || column_name as col, data_type from information_schema.columns
       where table_schema = 'public' and column_name like '%\\_cents' and data_type <> 'bigint'`,
    );
    expect(rows).toEqual([]);
  });

  it("perfil é criado automaticamente para cada usuário novo", async () => {
    expect(await count(alice, "select 1 from public.profiles where id = $1", [alice])).toBe(1);
  });

  it("cada um edita só o próprio perfil", async () => {
    await t.as(bob, () => t.db.query("update public.profiles set display_name = 'Hack' where id = $1", [alice]));
    await t.as(alice, () => t.db.query("update public.profiles set display_name = 'Alice' where id = $1", [alice]));
    const { rows } = await t.db.query<{ display_name: string }>("select display_name from public.profiles where id = $1", [alice]);
    expect(rows[0].display_name).toBe("Alice");
  });

  it("ninguém entra em um espaço inserindo direto na tabela (só por convite)", async () => {
    await expect(
      t.as(carol, () =>
        t.db.query("insert into public.household_members (household_id, user_id) values (gen_random_uuid(), $1)", [carol]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("isolamento entre usuários (dados pessoais)", () => {
  let aliceAccount: string;

  beforeAll(async () => {
    aliceAccount = await newAccount(alice, { owner: alice }, "Conta da Alice");
  });

  it("dono vê a própria conta; outro usuário não vê", async () => {
    expect(await count(alice, "select 1 from public.accounts where id = $1", [aliceAccount])).toBe(1);
    expect(await count(bob, "select 1 from public.accounts where id = $1", [aliceAccount])).toBe(0);
  });

  it("outro usuário não consegue alterar nem apagar a conta", async () => {
    await t.as(bob, () => t.db.query("update public.accounts set name = 'hack' where id = $1", [aliceAccount]));
    await t.as(bob, () => t.db.query("delete from public.accounts where id = $1", [aliceAccount]));
    const { rows } = await t.db.query<{ name: string }>("select name from public.accounts where id = $1", [aliceAccount]);
    expect(rows[0].name).toBe("Conta da Alice");
  });

  it("ninguém cria registro em nome de outra pessoa", async () => {
    await expect(newAccount(bob, { owner: alice }, "Falsa")).rejects.toThrow(/row-level security/);
  });

  it("não dá para lançar transação na conta de outra pessoa", async () => {
    await expect(
      t.as(bob, () =>
        t.db.query(
          `insert into public.transactions (owner_user_id, type, amount_cents, description, occurred_on, account_id, paid_on)
           values ($1, 'expense', 1000, 'x', '2026-11-01', $2, '2026-11-01')`,
          [bob, aliceAccount],
        ),
      ),
    ).rejects.toThrow(/titularidade/);
  });

  it("visitante não logado (anon) não lê nada", async () => {
    await expect(t.as(null, () => t.db.query("select * from public.accounts"))).rejects.toThrow(/permission denied/);
  });

  it("histórico de alterações registra a ação e não vaza para outro usuário", async () => {
    const sql = "select 1 from public.audit_logs where table_name = 'accounts' and record_id = $1";
    expect(await count(alice, sql, [aliceAccount])).toBeGreaterThanOrEqual(1);
    expect(await count(bob, sql, [aliceAccount])).toBe(0);
  });
});

describe("espaço compartilhado", () => {
  let household: string;
  let sharedAccount: string;
  let token: string;

  beforeAll(async () => {
    household = await t.as(alice, async () =>
      (await t.db.query<{ id: string }>("select public.create_household('Casa') as id")).rows[0].id,
    );
    token = await t.as(alice, async () =>
      (await t.db.query<{ token: string }>("select public.create_household_invite() as token")).rows[0].token,
    );
  });

  it("convite com token errado é recusado", async () => {
    await expect(
      t.as(bob, () => t.db.query("select public.accept_household_invite($1)", ["token-invalido"])),
    ).rejects.toThrow(/Convite inválido/);
  });

  it("o token não é salvo em texto puro", async () => {
    const { rows } = await t.db.query("select 1 from public.household_invites where token_hash = convert_to($1, 'UTF8')", [token]);
    expect(rows).toHaveLength(0);
  });

  it("convite válido coloca a segunda pessoa no espaço; o mesmo convite não serve duas vezes", async () => {
    await t.as(bob, () => t.db.query("select public.accept_household_invite($1)", [token]));
    expect(await count(bob, "select 1 from public.household_members where household_id = $1", [household])).toBe(2);
    await expect(
      t.as(carol, () => t.db.query("select public.accept_household_invite($1)", [token])),
    ).rejects.toThrow(/Convite inválido/);
  });

  it("espaço aceita no máximo 2 pessoas", async () => {
    await expect(
      t.as(alice, () => t.db.query("select public.create_household_invite()")),
    ).rejects.toThrow(/2 membros/);
  });

  it("os dois membros veem dados compartilhados; terceiro não", async () => {
    sharedAccount = await newAccount(alice, { household }, "Conta conjunta");
    expect(await count(bob, "select 1 from public.accounts where id = $1", [sharedAccount])).toBe(1);
    expect(await count(carol, "select 1 from public.accounts where id = $1", [sharedAccount])).toBe(0);
  });

  it("estar no mesmo espaço NÃO libera os dados pessoais do outro", async () => {
    expect(await count(bob, "select 1 from public.accounts where owner_user_id = $1", [alice])).toBe(0);
  });

  it("membros enxergam o perfil um do outro; terceiro não", async () => {
    expect(await count(bob, "select 1 from public.profiles where id = $1", [alice])).toBe(1);
    expect(await count(carol, "select 1 from public.profiles where id = $1", [alice])).toBe(0);
  });

  it("transação compartilhada guarda quem registrou e não aceita conta pessoal", async () => {
    const created = await t.as(bob, async () =>
      (
        await t.db.query<{ created_by: string }>(
          `insert into public.transactions (household_id, type, amount_cents, description, occurred_on, account_id, paid_on, responsible_user_id)
           values ($1, 'expense', 25990, 'Mercado', '2026-11-10', $2, '2026-11-10', $3) returning created_by`,
          [household, sharedAccount, alice],
        )
      ).rows[0],
    );
    expect(created.created_by).toBe(bob);

    const bobPersonal = await newAccount(bob, { owner: bob }, "Conta do Bob");
    await expect(
      t.as(bob, () =>
        t.db.query(
          `insert into public.transactions (household_id, type, amount_cents, description, occurred_on, account_id, paid_on)
           values ($1, 'expense', 100, 'x', '2026-11-10', $2, '2026-11-10')`,
          [household, bobPersonal],
        ),
      ),
    ).rejects.toThrow(/titularidade/);
  });

  it("idempotência: a mesma chave não cria a transação duas vezes", async () => {
    const key = randomUUID();
    const insert = () =>
      t.as(alice, () =>
        t.db.query(
          `insert into public.transactions (household_id, type, amount_cents, description, occurred_on, account_id, paid_on, idempotency_key)
           values ($1, 'income', 500000, 'Salário', '2026-11-05', $2, '2026-11-05', $3)`,
          [household, sharedAccount, key],
        ),
      );
    await insert();
    await expect(insert()).rejects.toThrow(/duplicate key/);
  });
});
