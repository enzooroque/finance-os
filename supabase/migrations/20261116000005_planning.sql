-- =============================================================================
-- Finance OS · Migração 0005 · Planejamento: contas a pagar, metas e orçamentos
-- Recorrências: as datas são calculadas a partir da regra; só ficam gravadas as
-- ocorrências que mudaram (paga, pulada ou com valor diferente). UNIQUE (rule_id, due_on)
-- impede pagar a mesma ocorrência duas vezes.
-- Metas: aporte/retirada é dinheiro "reservado"; não é despesa e não mexe no saldo.
-- =============================================================================

-- Paga uma ocorrência: grava a ocorrência como paga e cria o lançamento, juntos.
-- Competência = vencimento; caixa = data do pagamento.
create function public.pay_occurrence(
  p_rule_id uuid, p_due_on date, p_account_id uuid, p_amount_cents bigint, p_paid_on date
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  r public.recurring_rules;
  v_occ uuid;
  v_tx uuid;
begin
  select * into r from public.recurring_rules where id = p_rule_id;
  if r.id is null then raise exception 'Conta recorrente não encontrada' using errcode = '22023'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'Informe um valor maior que zero' using errcode = '22023'; end if;

  insert into public.recurring_occurrences (rule_id, due_on, amount_cents, status)
  values (r.id, p_due_on, p_amount_cents, 'paid')
  on conflict (rule_id, due_on) do update
    set status = 'paid', amount_cents = excluded.amount_cents
    where public.recurring_occurrences.status <> 'paid'
  returning id into v_occ;
  if v_occ is null then raise exception 'Esta conta já foi paga' using errcode = '23505'; end if;

  insert into public.transactions (
    owner_user_id, household_id, type, amount_cents, description, category_id, occurred_on,
    account_id, status, paid_on, is_fixed, recurring_occurrence_id
  ) values (
    r.owner_user_id, r.household_id, r.type, p_amount_cents, r.description, r.category_id, p_due_on,
    p_account_id, 'paid', coalesce(p_paid_on, p_due_on), true, v_occ
  ) returning id into v_tx;
  return v_tx;
end $$;

-- Pula uma ocorrência (não paga este mês). Não vale para ocorrência já paga.
create function public.skip_occurrence(p_rule_id uuid, p_due_on date)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  r public.recurring_rules;
begin
  select * into r from public.recurring_rules where id = p_rule_id;
  if r.id is null then raise exception 'Conta recorrente não encontrada' using errcode = '22023'; end if;
  insert into public.recurring_occurrences (rule_id, due_on, amount_cents, status)
  values (r.id, p_due_on, r.amount_cents, 'skipped')
  on conflict (rule_id, due_on) do update set status = 'skipped'
    where public.recurring_occurrences.status <> 'paid';
end $$;

-- Muda o valor de UMA ocorrência (a série continua igual).
create function public.set_occurrence_amount(p_rule_id uuid, p_due_on date, p_amount_cents bigint)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.recurring_rules where id = p_rule_id) then
    raise exception 'Conta recorrente não encontrada' using errcode = '22023';
  end if;
  insert into public.recurring_occurrences (rule_id, due_on, amount_cents, status)
  values (p_rule_id, p_due_on, p_amount_cents, 'pending')
  on conflict (rule_id, due_on) do update set amount_cents = excluded.amount_cents, status = 'pending'
    where public.recurring_occurrences.status <> 'paid';
end $$;

-- Excluir o lançamento de uma ocorrência paga devolve a ocorrência para "a pagar".
create function public.tg_release_occurrence()
returns trigger language plpgsql set search_path = '' as $$
begin
  delete from public.recurring_occurrences where id = old.recurring_occurrence_id;
  return null;
end $$;

create trigger transactions_release_occurrence after delete on public.transactions
  for each row when (old.recurring_occurrence_id is not null)
  execute function public.tg_release_occurrence();

-- ---------------------------------------------------------------------------
-- Metas
-- ---------------------------------------------------------------------------
create view public.goal_progress with (security_invoker = true) as
select
  g.id as goal_id,
  coalesce((select sum(case when c.kind = 'deposit' then c.amount_cents else -c.amount_cents end)
            from public.goal_contributions c where c.goal_id = g.id), 0)::bigint as saved_cents
from public.financial_goals g;

revoke all on public.goal_progress from anon;
grant select on public.goal_progress to authenticated;

-- Aporte ou retirada. Retirada não pode passar do que está guardado. Idempotente.
create function public.add_goal_movement(
  p_goal_id uuid, p_kind public.goal_movement, p_amount_cents bigint, p_occurred_on date,
  p_notes text, p_idempotency_key uuid
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
  v_saved bigint;
begin
  perform 1 from public.financial_goals where id = p_goal_id for update;
  if not found then raise exception 'Meta não encontrada' using errcode = '22023'; end if;

  select c.id into v_id from public.goal_contributions c
  where c.created_by = (select auth.uid()) and c.idempotency_key = p_idempotency_key;
  if v_id is not null then return v_id; end if;

  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'Informe um valor maior que zero' using errcode = '22023'; end if;
  if p_kind = 'withdrawal' then
    select saved_cents into v_saved from public.goal_progress where goal_id = p_goal_id;
    if p_amount_cents > coalesce(v_saved, 0) then
      raise exception 'A retirada não pode ser maior que o valor guardado' using errcode = '22023';
    end if;
  end if;

  insert into public.goal_contributions (goal_id, kind, amount_cents, occurred_on, notes, idempotency_key)
  values (p_goal_id, p_kind, p_amount_cents, p_occurred_on, nullif(p_notes, ''), p_idempotency_key)
  returning id into v_id;
  return v_id;
end $$;

revoke execute on function public.pay_occurrence(uuid, date, uuid, bigint, date) from public, anon;
revoke execute on function public.skip_occurrence(uuid, date) from public, anon;
revoke execute on function public.set_occurrence_amount(uuid, date, bigint) from public, anon;
revoke execute on function public.add_goal_movement(uuid, public.goal_movement, bigint, date, text, uuid) from public, anon;
revoke execute on function public.tg_release_occurrence() from public, anon;
grant execute on function
  public.pay_occurrence(uuid, date, uuid, bigint, date), public.skip_occurrence(uuid, date),
  public.set_occurrence_amount(uuid, date, bigint),
  public.add_goal_movement(uuid, public.goal_movement, bigint, date, text, uuid)
to authenticated;
