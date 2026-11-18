-- =============================================================================
-- Finance OS · Migração 0003 · Núcleo financeiro
--   * categorias padrão do sistema e regras de subcategoria
--   * saldos das contas (view que respeita o RLS de quem consulta)
--   * save_transaction: cria/edita lançamento + divisão numa operação atômica e idempotente
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Categorias
-- ---------------------------------------------------------------------------
-- Nome único dentro do mesmo escopo, tipo e categoria-mãe (sem diferenciar maiúsculas).
create unique index categories_unique_name
  on public.categories (owner_user_id, household_id, kind, parent_id, lower(name)) nulls not distinct;

-- Subcategoria: só 1 nível, mesmo tipo e mesma titularidade da mãe (mãe do sistema vale para todos).
create function public.tg_category_parent()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  p public.categories;
begin
  if new.parent_id is null then return new; end if;
  select * into p from public.categories where id = new.parent_id;
  if p.id is null or p.parent_id is not null or p.id = new.id then
    raise exception 'Subcategoria só pode ficar dentro de uma categoria principal' using errcode = '23514';
  end if;
  if p.kind <> new.kind then
    raise exception 'A subcategoria precisa ser do mesmo tipo da categoria principal' using errcode = '23514';
  end if;
  if num_nonnulls(p.owner_user_id, p.household_id) > 0
     and (p.owner_user_id is distinct from new.owner_user_id or p.household_id is distinct from new.household_id) then
    raise exception 'A subcategoria precisa ter a mesma titularidade da categoria principal' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger categories_parent before insert or update on public.categories
  for each row execute function public.tg_category_parent();

-- Categorias padrão (somente leitura para todos). Pode rodar de novo sem duplicar.
insert into public.categories (kind, name, color, icon)
select v.kind::public.category_kind, v.name, v.color, v.icon
from (values
  ('income',  'Salário',          '#10b981', 'briefcase'),
  ('income',  'Freelance',        '#34d399', 'laptop'),
  ('income',  'Rendimentos',      '#22c55e', 'trending-up'),
  ('income',  'Reembolso',        '#4ade80', 'rotate-ccw'),
  ('income',  'Outras receitas',  '#86efac', 'plus-circle'),
  ('expense', 'Moradia',          '#7c5cff', 'home'),
  ('expense', 'Mercado',          '#3b82f6', 'shopping-cart'),
  ('expense', 'Alimentação',      '#f59e0b', 'utensils'),
  ('expense', 'Transporte',       '#06b6d4', 'car'),
  ('expense', 'Saúde',            '#ef4444', 'heart-pulse'),
  ('expense', 'Educação',         '#8b5cf6', 'graduation-cap'),
  ('expense', 'Lazer',            '#ec4899', 'party-popper'),
  ('expense', 'Assinaturas',      '#a855f7', 'repeat'),
  ('expense', 'Contas da casa',   '#eab308', 'zap'),
  ('expense', 'Compras',          '#f97316', 'shopping-bag'),
  ('expense', 'Impostos e taxas', '#64748b', 'landmark'),
  ('expense', 'Outras despesas',  '#94a3b8', 'circle-ellipsis')
) as v(kind, name, color, icon)
where not exists (
  select 1 from public.categories c
  where c.owner_user_id is null and c.household_id is null and c.parent_id is null
    and c.kind = v.kind::public.category_kind and lower(c.name) = lower(v.name)
);

-- ---------------------------------------------------------------------------
-- Saldos (regime de CAIXA): só o que já foi pago mexe no saldo.
--   saldo = inicial + receitas pagas − despesas pagas + transferências recebidas
--           − transferências enviadas − pagamentos de fatura
-- security_invoker: a view roda com as permissões (RLS) de quem consulta.
-- ---------------------------------------------------------------------------
create view public.account_balances with (security_invoker = true) as
select
  a.id as account_id,
  (a.initial_balance_cents
    + coalesce((select sum(case when t.type = 'income' then t.amount_cents else -t.amount_cents end)
                from public.transactions t where t.account_id = a.id and t.status = 'paid'), 0)
    + coalesce((select sum(tr.amount_cents) from public.transfers tr where tr.to_account_id = a.id), 0)
    - coalesce((select sum(tr.amount_cents) from public.transfers tr where tr.from_account_id = a.id), 0)
    - coalesce((select sum(sp.amount_cents) from public.statement_payments sp where sp.account_id = a.id), 0)
  )::bigint as balance_cents,
  coalesce((select sum(case when t.type = 'income' then t.amount_cents else -t.amount_cents end)
            from public.transactions t where t.account_id = a.id and t.status = 'pending'), 0)::bigint as pending_cents
from public.accounts a;

revoke all on public.account_balances from anon;
grant select on public.account_balances to authenticated;

-- Pagamento de fatura também precisa aparecer para quem vê a CONTA de onde o dinheiro saiu
-- (senão o saldo da conta conjunta ficaria diferente para cada membro).
drop policy statement_payments_select on public.statement_payments;
create policy statement_payments_select on public.statement_payments for select to authenticated
  using (public.can_access_statement(statement_id) or public.can_access_account(account_id));

-- ---------------------------------------------------------------------------
-- save_transaction: cria (p_id nulo) ou edita um lançamento em conta, com divisão.
-- SECURITY INVOKER: roda como o usuário, então RLS e gatilhos de escopo valem.
-- Idempotente: repetir a criação com a mesma p_idempotency_key devolve o mesmo id.
-- p_splits: [{"user_id": "...", "amount_cents": 123}, ...] em centavos; soma = valor.
-- ---------------------------------------------------------------------------
create function public.save_transaction(
  p_id uuid,
  p_scope text,
  p_type public.transaction_type,
  p_amount_cents bigint,
  p_description text,
  p_category_id uuid,
  p_occurred_on date,
  p_account_id uuid,
  p_status public.transaction_status,
  p_paid_on date,
  p_responsible_user_id uuid,
  p_is_fixed boolean,
  p_notes text,
  p_splits jsonb,
  p_idempotency_key uuid
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_owner uuid;
  v_household uuid;
  v_id uuid;
  v_paid_on date := case when p_status = 'paid' then coalesce(p_paid_on, p_occurred_on) end;
  v_split_count int := coalesce(jsonb_array_length(p_splits), 0);
begin
  if uid is null then raise exception 'Não autenticado' using errcode = '42501'; end if;

  if p_scope = 'personal' then
    v_owner := uid;
  elsif p_scope = 'shared' then
    select m.household_id into v_household from public.household_members m where m.user_id = uid;
    if v_household is null then
      raise exception 'Você não participa de um espaço compartilhado' using errcode = '42501';
    end if;
  else
    raise exception 'Titularidade inválida' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.transactions (
      owner_user_id, household_id, type, amount_cents, description, category_id, occurred_on,
      account_id, status, paid_on, responsible_user_id, is_fixed, notes, idempotency_key
    ) values (
      v_owner, v_household, p_type, p_amount_cents, p_description, p_category_id, p_occurred_on,
      p_account_id, p_status, v_paid_on, coalesce(p_responsible_user_id, uid), coalesce(p_is_fixed, false),
      nullif(p_notes, ''), p_idempotency_key
    )
    on conflict (created_by, idempotency_key) do nothing
    returning id into v_id;

    if v_id is null then
      -- Já criado antes (duplo clique / reenvio): devolve o existente sem repetir nada.
      select t.id into v_id from public.transactions t
      where t.created_by = uid and t.idempotency_key = p_idempotency_key;
      return v_id;
    end if;
  else
    update public.transactions set
      owner_user_id = v_owner, household_id = v_household, type = p_type, amount_cents = p_amount_cents,
      description = p_description, category_id = p_category_id, occurred_on = p_occurred_on,
      account_id = p_account_id, status = p_status, paid_on = v_paid_on,
      responsible_user_id = coalesce(p_responsible_user_id, uid), is_fixed = coalesce(p_is_fixed, false),
      notes = nullif(p_notes, '')
    where id = p_id and credit_card_id is null
    returning id into v_id;
    if v_id is null then raise exception 'Lançamento não encontrado' using errcode = '22023'; end if;
  end if;

  delete from public.expense_splits where transaction_id = v_id;
  if v_split_count > 0 then
    if v_household is null or p_type <> 'expense' then
      raise exception 'Divisão só vale para despesas compartilhadas' using errcode = '22023';
    end if;
    if (select coalesce(sum((s ->> 'amount_cents')::bigint), 0) from jsonb_array_elements(p_splits) s) <> p_amount_cents then
      raise exception 'A soma da divisão precisa ser igual ao valor do lançamento' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_splits) s
      where (s ->> 'amount_cents')::bigint < 0
         or not exists (select 1 from public.household_members m
                        where m.household_id = v_household and m.user_id = (s ->> 'user_id')::uuid)
    ) then
      raise exception 'A divisão só pode ser entre membros do espaço, com valores positivos' using errcode = '22023';
    end if;
    if (select count(distinct s ->> 'user_id') from jsonb_array_elements(p_splits) s) <> v_split_count then
      raise exception 'Cada pessoa aparece só uma vez na divisão' using errcode = '22023';
    end if;
    insert into public.expense_splits (transaction_id, user_id, amount_cents)
    select v_id, (s ->> 'user_id')::uuid, (s ->> 'amount_cents')::bigint from jsonb_array_elements(p_splits) s;
  end if;

  return v_id;
end $$;

revoke execute on function public.save_transaction(
  uuid, text, public.transaction_type, bigint, text, uuid, date, uuid, public.transaction_status,
  date, uuid, boolean, text, jsonb, uuid
) from public, anon;
grant execute on function public.save_transaction(
  uuid, text, public.transaction_type, bigint, text, uuid, date, uuid, public.transaction_status,
  date, uuid, boolean, text, jsonb, uuid
) to authenticated;
revoke execute on function public.tg_category_parent() from public, anon;
