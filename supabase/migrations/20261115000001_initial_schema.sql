-- =============================================================================
-- Finance OS · Migração 0001 · Esquema inicial, regras de acesso (RLS) e auditoria
-- =============================================================================
-- Regras de propriedade (valem para todas as tabelas "com escopo"):
--   * owner_user_id preenchido  -> registro PESSOAL daquele usuário.
--   * household_id preenchido   -> registro COMPARTILHADO do espaço (máx. 2 membros).
--   * Exatamente um dos dois é preenchido (CHECK num_nonnulls = 1).
--   * Quem pode ler/escrever: o dono, ou qualquer membro do espaço. Isso é garantido
--     pelo RLS no banco, nunca por filtro no frontend.
-- Dinheiro: sempre BIGINT em centavos (colunas *_cents). Nunca float/numeric.
-- Datas financeiras: tipo DATE (sem fuso). Carimbos de tempo: TIMESTAMPTZ.
-- =============================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.account_type as enum ('checking', 'savings', 'digital_wallet', 'cash', 'investment');
create type public.record_status as enum ('active', 'archived');
create type public.transaction_type as enum ('income', 'expense');
create type public.transaction_status as enum ('pending', 'paid');
create type public.category_kind as enum ('income', 'expense');
create type public.statement_status as enum ('open', 'closed');
create type public.recurrence_frequency as enum ('weekly', 'monthly', 'yearly');
create type public.occurrence_status as enum ('pending', 'paid', 'skipped');
create type public.goal_movement as enum ('deposit', 'withdrawal');
create type public.household_role as enum ('owner', 'member');

-- ---------------------------------------------------------------------------
-- Pessoas e espaço compartilhado
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_color text not null default '#7c5cff' check (avatar_color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.household_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id) -- cada pessoa participa de no máximo 1 espaço
);

-- O token do convite NUNCA é salvo; só o hash SHA-256 dele.
create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  token_hash bytea not null unique,
  created_by uuid not null references public.profiles (id),
  expires_at timestamptz not null,
  accepted_by uuid references public.profiles (id),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Funções de acesso (usadas pelas políticas RLS)
-- SECURITY DEFINER evita recursão de RLS; todas comparam com auth.uid().
-- ---------------------------------------------------------------------------
create function public.is_household_member(hid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = (select auth.uid())
  );
$$;

create function public.can_access(owner uuid, hid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(owner = (select auth.uid()), false)
      or (hid is not null and public.is_household_member(hid));
$$;

-- ---------------------------------------------------------------------------
-- Cadastros financeiros
-- ---------------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.profiles (id) on delete cascade,
  household_id uuid references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  institution text check (char_length(institution) <= 60),
  type public.account_type not null,
  initial_balance_cents bigint not null default 0,
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon text check (char_length(icon) <= 40),
  status public.record_status not null default 'active',
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_scope check (num_nonnulls(owner_user_id, household_id) = 1)
);

-- Nunca guardamos número completo, CVV ou senha: só os 4 últimos dígitos (opcional).
create table public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.profiles (id) on delete cascade,
  household_id uuid references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  institution text check (char_length(institution) <= 60),
  brand text not null default 'other'
    check (brand in ('visa', 'mastercard', 'elo', 'amex', 'hipercard', 'other')),
  last_four text check (last_four ~ '^[0-9]{4}$'),
  limit_cents bigint not null check (limit_cents >= 0),
  closing_day smallint not null check (closing_day between 1 and 31),
  due_day smallint not null check (due_day between 1 and 31),
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  status public.record_status not null default 'active',
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_cards_scope check (num_nonnulls(owner_user_id, household_id) = 1)
);

-- Categorias sem dono (owner e household nulos) são categorias padrão do sistema:
-- todos leem, ninguém edita pelo app.
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.profiles (id) on delete cascade,
  household_id uuid references public.households (id) on delete cascade,
  parent_id uuid references public.categories (id) on delete restrict,
  kind public.category_kind not null,
  name text not null check (char_length(name) between 1 and 40),
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon text check (char_length(icon) <= 40),
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_scope check (num_nonnulls(owner_user_id, household_id) <= 1)
);

-- Fatura: o total é DERIVADO das transações ligadas a ela; o pago, dos pagamentos.
-- Situação exibida: aberta/fechada (status) + parcial/paga (pagamentos vs. total).
create table public.credit_card_statements (
  id uuid primary key default gen_random_uuid(),
  credit_card_id uuid not null references public.credit_cards (id) on delete cascade,
  reference_month date not null check (extract(day from reference_month) = 1),
  closing_date date not null,
  due_date date not null,
  status public.statement_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (credit_card_id, reference_month),
  check (due_date >= closing_date)
);

create table public.installment_purchases (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.profiles (id) on delete cascade,
  household_id uuid references public.households (id) on delete cascade,
  credit_card_id uuid not null references public.credit_cards (id) on delete restrict,
  category_id uuid references public.categories (id) on delete set null,
  description text not null check (char_length(description) between 1 and 140),
  total_cents bigint not null check (total_cents > 0),
  installments_count smallint not null check (installments_count between 1 and 72),
  purchased_on date not null,
  idempotency_key uuid not null,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint installment_purchases_scope check (num_nonnulls(owner_user_id, household_id) = 1),
  unique (created_by, idempotency_key)
);

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.profiles (id) on delete cascade,
  household_id uuid references public.households (id) on delete cascade,
  type public.transaction_type not null,
  description text not null check (char_length(description) between 1 and 140),
  amount_cents bigint not null check (amount_cents > 0),
  category_id uuid references public.categories (id) on delete set null,
  account_id uuid references public.accounts (id) on delete restrict,
  credit_card_id uuid references public.credit_cards (id) on delete restrict,
  frequency public.recurrence_frequency not null,
  interval_count smallint not null default 1 check (interval_count between 1 and 12),
  anchor_day smallint check (anchor_day between 1 and 31),
  start_on date not null,
  end_on date,
  next_due_on date not null,
  status public.record_status not null default 'active',
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_rules_scope check (num_nonnulls(owner_user_id, household_id) = 1),
  check (num_nonnulls(account_id, credit_card_id) <= 1),
  check (credit_card_id is null or type = 'expense'),
  check (end_on is null or end_on >= start_on)
);

-- UNIQUE (rule_id, due_on) impede ocorrência duplicada da mesma recorrência.
create table public.recurring_occurrences (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.recurring_rules (id) on delete cascade,
  due_on date not null,
  amount_cents bigint not null check (amount_cents > 0),
  status public.occurrence_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rule_id, due_on)
);

-- Receitas e despesas. Transferências, pagamentos de fatura e aportes em metas
-- ficam em tabelas próprias e NÃO contam como receita/despesa.
--   * occurred_on = data de competência (quando aconteceu / data da compra).
--   * paid_on     = data de caixa (quando o dinheiro saiu/entrou da conta).
--   * Compra no cartão: é a despesa (credit_card_id + statement_id). Não mexe no
--     saldo da conta; quem mexe é o pagamento da fatura (statement_payments).
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.profiles (id) on delete cascade,
  household_id uuid references public.households (id) on delete cascade,
  type public.transaction_type not null,
  amount_cents bigint not null check (amount_cents > 0),
  description text not null check (char_length(description) between 1 and 140),
  category_id uuid references public.categories (id) on delete set null,
  occurred_on date not null,
  account_id uuid references public.accounts (id) on delete restrict,
  credit_card_id uuid references public.credit_cards (id) on delete restrict,
  statement_id uuid references public.credit_card_statements (id) on delete restrict,
  installment_purchase_id uuid references public.installment_purchases (id) on delete cascade,
  installment_number smallint check (installment_number >= 1),
  recurring_occurrence_id uuid unique references public.recurring_occurrences (id) on delete set null,
  status public.transaction_status not null default 'paid',
  paid_on date,
  responsible_user_id uuid references public.profiles (id),
  is_fixed boolean not null default false,
  notes text check (char_length(notes) <= 1000),
  idempotency_key uuid,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_scope check (num_nonnulls(owner_user_id, household_id) = 1),
  constraint transactions_source check (num_nonnulls(account_id, credit_card_id) = 1),
  constraint transactions_card_is_expense check (credit_card_id is null or type = 'expense'),
  constraint transactions_statement_needs_card check (statement_id is null or credit_card_id is not null),
  constraint transactions_installment_pair check ((installment_purchase_id is null) = (installment_number is null)),
  constraint transactions_paid_has_date check (status = 'pending' or credit_card_id is not null or paid_on is not null),
  unique (installment_purchase_id, installment_number),
  unique (created_by, idempotency_key)
);

-- Divisão de uma despesa compartilhada entre as pessoas (sempre em centavos;
-- percentuais são convertidos na criação e a soma deve fechar com o total).
create table public.expense_splits (
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  amount_cents bigint not null check (amount_cents >= 0),
  primary key (transaction_id, user_id)
);

-- Transferência entre contas: não é receita nem despesa.
-- Pode ligar uma conta pessoal a uma compartilhada (ex.: aporte na conta conjunta).
create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  from_account_id uuid not null references public.accounts (id) on delete restrict,
  to_account_id uuid not null references public.accounts (id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  occurred_on date not null,
  description text check (char_length(description) <= 140),
  idempotency_key uuid,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_account_id <> to_account_id),
  unique (created_by, idempotency_key)
);

-- Pagamento de fatura: liquidação (sai da conta), não é uma segunda despesa.
create table public.statement_payments (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.credit_card_statements (id) on delete restrict,
  account_id uuid not null references public.accounts (id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  paid_on date not null,
  idempotency_key uuid,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (created_by, idempotency_key)
);

create table public.financial_goals (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.profiles (id) on delete cascade,
  household_id uuid references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  target_cents bigint not null check (target_cents > 0),
  deadline date,
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon text check (char_length(icon) <= 40),
  status public.record_status not null default 'active',
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_goals_scope check (num_nonnulls(owner_user_id, household_id) = 1)
);

-- Aporte/retirada de meta: dinheiro "reservado", não é despesa.
create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.financial_goals (id) on delete cascade,
  kind public.goal_movement not null,
  amount_cents bigint not null check (amount_cents > 0),
  account_id uuid references public.accounts (id) on delete set null,
  occurred_on date not null,
  notes text check (char_length(notes) <= 280),
  idempotency_key uuid,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (created_by, idempotency_key)
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.profiles (id) on delete cascade,
  household_id uuid references public.households (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  planned_cents bigint not null check (planned_cents >= 0),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_scope check (num_nonnulls(owner_user_id, household_id) = 1),
  unique nulls not distinct (owner_user_id, household_id, category_id, month)
);

-- Histórico de alterações. Só gravado por gatilho; o app não escreve aqui.
create table public.audit_logs (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor_id uuid,
  owner_user_id uuid,
  household_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Funções de acesso para tabelas "filhas" (o escopo vem do registro pai)
-- ---------------------------------------------------------------------------
create function public.can_access_account(aid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.accounts a where a.id = aid and public.can_access(a.owner_user_id, a.household_id));
$$;

create function public.can_access_card(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.credit_cards c where c.id = cid and public.can_access(c.owner_user_id, c.household_id));
$$;

create function public.can_access_statement(sid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.credit_card_statements s where s.id = sid and public.can_access_card(s.credit_card_id));
$$;

create function public.can_access_goal(gid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.financial_goals g where g.id = gid and public.can_access(g.owner_user_id, g.household_id));
$$;

create function public.can_access_rule(rid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.recurring_rules r where r.id = rid and public.can_access(r.owner_user_id, r.household_id));
$$;

create function public.can_access_transaction(tid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.transactions t where t.id = tid and public.can_access(t.owner_user_id, t.household_id));
$$;

-- Duas pessoas "se veem" (perfil) se estão no mesmo espaço.
create function public.shares_household(other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members me
    join public.household_members them on them.household_id = me.household_id
    where me.user_id = (select auth.uid()) and them.user_id = other
  );
$$;

-- ---------------------------------------------------------------------------
-- Gatilhos de consistência
-- ---------------------------------------------------------------------------
create function public.tg_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- created_by é imutável depois de criado.
create function public.tg_keep_created_by()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.created_by := old.created_by;
  return new;
end $$;

-- Um registro só pode apontar para conta/cartão/categoria do MESMO escopo
-- (pessoal do mesmo dono, ou do mesmo espaço). Categorias do sistema valem para todos.
create function public.assert_same_scope(
  ref_owner uuid, ref_household uuid, new_owner uuid, new_household uuid, what text
) returns void language plpgsql set search_path = '' as $$
begin
  if ref_owner is distinct from new_owner or ref_household is distinct from new_household then
    raise exception '% precisa ter a mesma titularidade do lançamento', what using errcode = '23514';
  end if;
end $$;

create function public.tg_check_scope()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  rec jsonb := to_jsonb(new);
  o uuid;
  h uuid;
begin
  -- Campos lidos via jsonb porque nem toda tabela tem todas as colunas.
  if (rec ->> 'account_id') is not null then
    select a.owner_user_id, a.household_id into o, h from public.accounts a where a.id = (rec ->> 'account_id')::uuid;
    perform public.assert_same_scope(o, h, new.owner_user_id, new.household_id, 'A conta');
  end if;
  if (rec ->> 'credit_card_id') is not null then
    select c.owner_user_id, c.household_id into o, h from public.credit_cards c where c.id = (rec ->> 'credit_card_id')::uuid;
    perform public.assert_same_scope(o, h, new.owner_user_id, new.household_id, 'O cartão');
  end if;
  if (rec ->> 'category_id') is not null then
    select c.owner_user_id, c.household_id into o, h from public.categories c where c.id = (rec ->> 'category_id')::uuid;
    if num_nonnulls(o, h) > 0 then
      perform public.assert_same_scope(o, h, new.owner_user_id, new.household_id, 'A categoria');
    end if;
  end if;
  if (rec ->> 'statement_id') is not null and not exists (
    select 1 from public.credit_card_statements s
    where s.id = (rec ->> 'statement_id')::uuid and s.credit_card_id = (rec ->> 'credit_card_id')::uuid
  ) then
    raise exception 'A fatura não pertence a este cartão' using errcode = '23514';
  end if;
  if (rec ->> 'responsible_user_id') is not null
     and (rec ->> 'responsible_user_id')::uuid is distinct from new.owner_user_id
     and not exists (
       select 1 from public.household_members m
       where m.household_id = new.household_id and m.user_id = (rec ->> 'responsible_user_id')::uuid
     ) then
    raise exception 'O responsável precisa ser o dono ou membro do espaço' using errcode = '23514';
  end if;
  return new;
end $$;

-- No máximo 2 membros por espaço (trava o espaço para evitar corrida).
create function public.tg_household_member_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.households where id = new.household_id for update;
  if (select count(*) from public.household_members where household_id = new.household_id) >= 2 then
    raise exception 'Este espaço já tem 2 membros' using errcode = '23514';
  end if;
  return new;
end $$;

-- Auditoria genérica (não grava segredo algum: o banco não guarda nenhum).
create function public.tg_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_logs (table_name, record_id, action, actor_id, owner_user_id, household_id, old_data, new_data)
  values (
    tg_table_name,
    coalesce(rec ->> 'id', rec ->> 'transaction_id')::uuid,
    tg_op,
    (select auth.uid()),
    (rec ->> 'owner_user_id')::uuid,
    (rec ->> 'household_id')::uuid,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return null;
end $$;

-- Cria o perfil automaticamente quando um usuário é criado no Supabase Auth.
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1), 'Usuário'), 60)
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger household_member_limit before insert on public.household_members
  for each row execute function public.tg_household_member_limit();

create trigger transactions_scope before insert or update on public.transactions
  for each row execute function public.tg_check_scope();
create trigger installment_purchases_scope before insert or update on public.installment_purchases
  for each row execute function public.tg_check_scope();
create trigger recurring_rules_scope before insert or update on public.recurring_rules
  for each row execute function public.tg_check_scope();
create trigger budgets_scope before insert or update on public.budgets
  for each row execute function public.tg_check_scope();

do $$
declare
  t text;
begin
  -- updated_at automático
  foreach t in array array[
    'profiles', 'households', 'accounts', 'credit_cards', 'categories', 'credit_card_statements',
    'installment_purchases', 'recurring_rules', 'recurring_occurrences', 'transactions', 'transfers',
    'financial_goals', 'budgets'
  ] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.tg_set_updated_at()', t);
  end loop;
  -- created_by imutável
  foreach t in array array[
    'households', 'accounts', 'credit_cards', 'categories', 'installment_purchases', 'recurring_rules',
    'transactions', 'transfers', 'statement_payments', 'financial_goals', 'goal_contributions', 'budgets'
  ] loop
    execute format('create trigger keep_created_by before update on public.%I for each row execute function public.tg_keep_created_by()', t);
  end loop;
  -- histórico de alterações
  foreach t in array array[
    'accounts', 'credit_cards', 'categories', 'credit_card_statements', 'installment_purchases',
    'recurring_rules', 'recurring_occurrences', 'transactions', 'expense_splits', 'transfers',
    'statement_payments', 'financial_goals', 'goal_contributions', 'budgets'
  ] loop
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.tg_audit()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Espaço compartilhado: criação e convite (operações atômicas)
-- ---------------------------------------------------------------------------
create function public.create_household(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  hid uuid;
begin
  if uid is null then raise exception 'Não autenticado' using errcode = '42501'; end if;
  if exists (select 1 from public.household_members where user_id = uid) then
    raise exception 'Você já participa de um espaço compartilhado' using errcode = '23505';
  end if;
  insert into public.households (name, created_by) values (p_name, uid) returning id into hid;
  insert into public.household_members (household_id, user_id, role) values (hid, uid, 'owner');
  return hid;
end $$;

-- Gera um convite de uso único, válido por 72 h. Retorna o token UMA vez;
-- o banco guarda só o hash. Convites pendentes anteriores são invalidados.
create function public.create_household_invite()
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  hid uuid;
  token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  select household_id into hid from public.household_members where user_id = uid;
  if hid is null then raise exception 'Você não participa de um espaço' using errcode = '42501'; end if;
  if (select count(*) from public.household_members where household_id = hid) >= 2 then
    raise exception 'Este espaço já tem 2 membros' using errcode = '23514';
  end if;
  delete from public.household_invites where household_id = hid and accepted_at is null;
  insert into public.household_invites (household_id, token_hash, created_by, expires_at)
  values (hid, extensions.digest(token, 'sha256'), uid, now() + interval '72 hours');
  return token;
end $$;

create function public.accept_household_invite(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  inv public.household_invites;
begin
  if uid is null then raise exception 'Não autenticado' using errcode = '42501'; end if;
  select * into inv from public.household_invites
  where token_hash = extensions.digest(p_token, 'sha256')
  for update;
  -- Mensagem única para convite inexistente, usado ou expirado (não revela qual).
  if inv.id is null or inv.accepted_at is not null or inv.expires_at < now() then
    raise exception 'Convite inválido ou expirado' using errcode = '22023';
  end if;
  if exists (select 1 from public.household_members where user_id = uid) then
    raise exception 'Você já participa de um espaço compartilhado' using errcode = '23505';
  end if;
  insert into public.household_members (household_id, user_id, role) values (inv.household_id, uid, 'member');
  update public.household_invites set accepted_by = uid, accepted_at = now() where id = inv.id;
  return inv.household_id;
end $$;

-- ---------------------------------------------------------------------------
-- Índices (chaves estrangeiras e filtros mais usados)
-- ---------------------------------------------------------------------------
create index on public.household_invites (household_id);
create index on public.accounts (owner_user_id) where owner_user_id is not null;
create index on public.accounts (household_id) where household_id is not null;
create index on public.credit_cards (owner_user_id) where owner_user_id is not null;
create index on public.credit_cards (household_id) where household_id is not null;
create index on public.categories (owner_user_id) where owner_user_id is not null;
create index on public.categories (household_id) where household_id is not null;
create index on public.categories (parent_id);
create index on public.installment_purchases (credit_card_id);
create index on public.recurring_rules (owner_user_id, next_due_on) where owner_user_id is not null;
create index on public.recurring_rules (household_id, next_due_on) where household_id is not null;
create index on public.transactions (owner_user_id, occurred_on desc) where owner_user_id is not null;
create index on public.transactions (household_id, occurred_on desc) where household_id is not null;
create index on public.transactions (account_id, paid_on) where account_id is not null;
create index on public.transactions (credit_card_id) where credit_card_id is not null;
create index on public.transactions (statement_id) where statement_id is not null;
create index on public.transactions (category_id);
create index on public.expense_splits (user_id);
create index on public.transfers (from_account_id, occurred_on);
create index on public.transfers (to_account_id, occurred_on);
create index on public.statement_payments (statement_id);
create index on public.statement_payments (account_id);
create index on public.financial_goals (owner_user_id) where owner_user_id is not null;
create index on public.financial_goals (household_id) where household_id is not null;
create index on public.goal_contributions (goal_id, occurred_on);
create index on public.budgets (category_id);
create index on public.audit_logs (owner_user_id, created_at desc) where owner_user_id is not null;
create index on public.audit_logs (household_id, created_at desc) where household_id is not null;
create index on public.audit_logs (actor_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS: ligado em TODAS as tabelas. Sem política = acesso negado.
-- Visitantes não logados (anon) não têm política nenhuma.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_household(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- households / members / invites: escrita só pelas funções acima.
alter table public.households enable row level security;
create policy households_select on public.households for select to authenticated
  using (public.is_household_member(id));
create policy households_update on public.households for update to authenticated
  using (public.is_household_member(id)) with check (public.is_household_member(id));

alter table public.household_members enable row level security;
create policy household_members_select on public.household_members for select to authenticated
  using (public.is_household_member(household_id));

alter table public.household_invites enable row level security;
create policy household_invites_select on public.household_invites for select to authenticated
  using (public.is_household_member(household_id));

-- Tabelas com escopo próprio (dono OU espaço).
alter table public.accounts enable row level security;
create policy accounts_select on public.accounts for select to authenticated
  using (public.can_access(owner_user_id, household_id));
create policy accounts_insert on public.accounts for insert to authenticated
  with check (public.can_access(owner_user_id, household_id) and created_by = (select auth.uid()));
create policy accounts_update on public.accounts for update to authenticated
  using (public.can_access(owner_user_id, household_id)) with check (public.can_access(owner_user_id, household_id));
create policy accounts_delete on public.accounts for delete to authenticated
  using (public.can_access(owner_user_id, household_id));

alter table public.credit_cards enable row level security;
create policy credit_cards_select on public.credit_cards for select to authenticated
  using (public.can_access(owner_user_id, household_id));
create policy credit_cards_insert on public.credit_cards for insert to authenticated
  with check (public.can_access(owner_user_id, household_id) and created_by = (select auth.uid()));
create policy credit_cards_update on public.credit_cards for update to authenticated
  using (public.can_access(owner_user_id, household_id)) with check (public.can_access(owner_user_id, household_id));
create policy credit_cards_delete on public.credit_cards for delete to authenticated
  using (public.can_access(owner_user_id, household_id));

alter table public.categories enable row level security;
create policy categories_select on public.categories for select to authenticated
  using (num_nonnulls(owner_user_id, household_id) = 0 or public.can_access(owner_user_id, household_id));
create policy categories_insert on public.categories for insert to authenticated
  with check (public.can_access(owner_user_id, household_id) and created_by = (select auth.uid()));
create policy categories_update on public.categories for update to authenticated
  using (public.can_access(owner_user_id, household_id)) with check (public.can_access(owner_user_id, household_id));
create policy categories_delete on public.categories for delete to authenticated
  using (public.can_access(owner_user_id, household_id));

alter table public.installment_purchases enable row level security;
create policy installment_purchases_select on public.installment_purchases for select to authenticated
  using (public.can_access(owner_user_id, household_id));
create policy installment_purchases_insert on public.installment_purchases for insert to authenticated
  with check (public.can_access(owner_user_id, household_id) and created_by = (select auth.uid()));
create policy installment_purchases_update on public.installment_purchases for update to authenticated
  using (public.can_access(owner_user_id, household_id)) with check (public.can_access(owner_user_id, household_id));
create policy installment_purchases_delete on public.installment_purchases for delete to authenticated
  using (public.can_access(owner_user_id, household_id));

alter table public.recurring_rules enable row level security;
create policy recurring_rules_select on public.recurring_rules for select to authenticated
  using (public.can_access(owner_user_id, household_id));
create policy recurring_rules_insert on public.recurring_rules for insert to authenticated
  with check (public.can_access(owner_user_id, household_id) and created_by = (select auth.uid()));
create policy recurring_rules_update on public.recurring_rules for update to authenticated
  using (public.can_access(owner_user_id, household_id)) with check (public.can_access(owner_user_id, household_id));
create policy recurring_rules_delete on public.recurring_rules for delete to authenticated
  using (public.can_access(owner_user_id, household_id));

alter table public.transactions enable row level security;
create policy transactions_select on public.transactions for select to authenticated
  using (public.can_access(owner_user_id, household_id));
create policy transactions_insert on public.transactions for insert to authenticated
  with check (public.can_access(owner_user_id, household_id) and created_by = (select auth.uid()));
create policy transactions_update on public.transactions for update to authenticated
  using (public.can_access(owner_user_id, household_id)) with check (public.can_access(owner_user_id, household_id));
create policy transactions_delete on public.transactions for delete to authenticated
  using (public.can_access(owner_user_id, household_id));

alter table public.financial_goals enable row level security;
create policy financial_goals_select on public.financial_goals for select to authenticated
  using (public.can_access(owner_user_id, household_id));
create policy financial_goals_insert on public.financial_goals for insert to authenticated
  with check (public.can_access(owner_user_id, household_id) and created_by = (select auth.uid()));
create policy financial_goals_update on public.financial_goals for update to authenticated
  using (public.can_access(owner_user_id, household_id)) with check (public.can_access(owner_user_id, household_id));
create policy financial_goals_delete on public.financial_goals for delete to authenticated
  using (public.can_access(owner_user_id, household_id));

alter table public.budgets enable row level security;
create policy budgets_select on public.budgets for select to authenticated
  using (public.can_access(owner_user_id, household_id));
create policy budgets_insert on public.budgets for insert to authenticated
  with check (public.can_access(owner_user_id, household_id) and created_by = (select auth.uid()));
create policy budgets_update on public.budgets for update to authenticated
  using (public.can_access(owner_user_id, household_id)) with check (public.can_access(owner_user_id, household_id));
create policy budgets_delete on public.budgets for delete to authenticated
  using (public.can_access(owner_user_id, household_id));

-- Tabelas filhas: herdam o acesso do registro pai.
alter table public.credit_card_statements enable row level security;
create policy credit_card_statements_all on public.credit_card_statements for all to authenticated
  using (public.can_access_card(credit_card_id)) with check (public.can_access_card(credit_card_id));

alter table public.recurring_occurrences enable row level security;
create policy recurring_occurrences_all on public.recurring_occurrences for all to authenticated
  using (public.can_access_rule(rule_id)) with check (public.can_access_rule(rule_id));

alter table public.expense_splits enable row level security;
create policy expense_splits_all on public.expense_splits for all to authenticated
  using (public.can_access_transaction(transaction_id)) with check (public.can_access_transaction(transaction_id));

-- Transferência: vê quem acessa uma das pontas; cria/edita/apaga só quem acessa as duas.
alter table public.transfers enable row level security;
create policy transfers_select on public.transfers for select to authenticated
  using (public.can_access_account(from_account_id) or public.can_access_account(to_account_id));
create policy transfers_insert on public.transfers for insert to authenticated
  with check (public.can_access_account(from_account_id) and public.can_access_account(to_account_id)
              and created_by = (select auth.uid()));
create policy transfers_update on public.transfers for update to authenticated
  using (public.can_access_account(from_account_id) and public.can_access_account(to_account_id))
  with check (public.can_access_account(from_account_id) and public.can_access_account(to_account_id));
create policy transfers_delete on public.transfers for delete to authenticated
  using (public.can_access_account(from_account_id) and public.can_access_account(to_account_id));

-- Pagamentos e aportes não são editados: apaga e lança de novo (fica no histórico).
alter table public.statement_payments enable row level security;
create policy statement_payments_select on public.statement_payments for select to authenticated
  using (public.can_access_statement(statement_id));
create policy statement_payments_insert on public.statement_payments for insert to authenticated
  with check (public.can_access_statement(statement_id) and public.can_access_account(account_id)
              and created_by = (select auth.uid()));
create policy statement_payments_delete on public.statement_payments for delete to authenticated
  using (public.can_access_statement(statement_id) and public.can_access_account(account_id));

alter table public.goal_contributions enable row level security;
create policy goal_contributions_select on public.goal_contributions for select to authenticated
  using (public.can_access_goal(goal_id));
create policy goal_contributions_insert on public.goal_contributions for insert to authenticated
  with check (public.can_access_goal(goal_id) and (account_id is null or public.can_access_account(account_id))
              and created_by = (select auth.uid()));
create policy goal_contributions_delete on public.goal_contributions for delete to authenticated
  using (public.can_access_goal(goal_id));

alter table public.audit_logs enable row level security;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.can_access(owner_user_id, household_id) or actor_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Permissões: anon (não logado) não acessa nada; funções só para logados.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.audit_logs, public.household_members, public.household_invites from authenticated;
grant execute on function
  public.is_household_member(uuid), public.can_access(uuid, uuid), public.can_access_account(uuid),
  public.can_access_card(uuid), public.can_access_statement(uuid), public.can_access_goal(uuid),
  public.can_access_rule(uuid), public.can_access_transaction(uuid), public.shares_household(uuid),
  public.create_household(text), public.create_household_invite(), public.accept_household_invite(text)
to authenticated;
