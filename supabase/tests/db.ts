/**
 * Banco de teste: Postgres real rodando em WebAssembly (PGlite), sem Docker.
 * Recria o mínimo do Supabase (schema auth, auth.uid(), papéis anon/authenticated)
 * e aplica as migrações de supabase/migrations em ordem.
 * shortcut: não é o Supabase completo (sem GoTrue/PostgREST); na Fase 7 os mesmos
 * cenários devem rodar também contra `supabase start` antes do deploy.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`;

export async function createTestDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUB);
  const dir = join(process.cwd(), "supabase/migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(dir, file), "utf8"));
  }

  async function createUser(email: string): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      "insert into auth.users (email) values ($1) returning id",
      [email],
    );
    return rows[0].id;
  }

  /** Executa `fn` como um usuário logado (papel authenticated + auth.uid()). */
  async function as<T>(userId: string | null, fn: () => Promise<T>): Promise<T> {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
    await db.exec(`set role ${userId ? "authenticated" : "anon"}`);
    try {
      return await fn();
    } finally {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub', '', false)");
    }
  }

  return { db, createUser, as };
}
